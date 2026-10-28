# 真实模型与服务接入手册

- 版本：v0.1
- 适用：把占位实现替换为真实 LLM / ASR / TTS 服务
- 相关：[技术实现路线](./02-technical-roadmap.md)、[数据与接口契约](./contracts/data-and-interface-contracts.md)

后端所有模型调用都通过接口 seam，替换实现不需要改动业务代码。当前有三个 seam：

| seam | 接口 | 占位实现（默认） | 真实实现（配置开启后生效） |
|---|---|---|---|
| LLM 回复 | `ReplyGenerator` | `SimplePersonaReplyGenerator` | `HttpLlmReplyGenerator`（`LLM_ENABLED=true`） |
| 语音识别 | `AsrAdapter` | `StubAsrAdapter` | `HttpAsrAdapter`（`VOICE_ENABLED=true` + `VOICE_ASR_URL`） |
| 语音合成 | `TtsAdapter` | `StubTtsAdapter` | `HttpTtsAdapter`（`VOICE_ENABLED=true` + `VOICE_TTS_URL`） |

三者都遵循同一降级策略：**调用失败、超时或返回空结果时自动回退占位实现**，对话链路不会中断。这是 PRD FR-3.5 的落地方式。

## 一、接入真实 LLM

支持的接口是 OpenAI 兼容的 `POST {base-url}/chat/completions`。

```cmd
set LLM_ENABLED=true
set LLM_BASE_URL=https://dashscope.aliyuncs.com/compatible-mode/v1
set LLM_API_KEY=sk-xxx
set LLM_MODEL=qwen3.7-plus
set LLM_MAX_TOKENS=256
set LLM_TEMPERATURE=0.8
set LLM_TIMEOUT_SECONDS=30
mvn -B spring-boot:run -pl services/core
```

自托管（vLLM / Ollama）只要暴露相同的 `/chat/completions` 接口即可，例如 `http://127.0.0.1:11434/v1`。

系统提示词由 `PersonaService` 从 `characters.persona_config` 组装，包含年龄、性格、说话风格、背景和“不确定用户情绪时不要下断言”等约束。要调整人设，改数据库种子（`V2__seed_character.sql`）或对应角色行，不要改 Java。

## 二、接入真实 ASR

后端约定的最小协议（自定义包装服务，便于对接 FunASR/Paraformer）：

```text
POST {VOICE_ASR_URL}
Content-Type: application/json
{ "audioBase64": "...", "contentType": "audio/wav" }

200 OK
{ "text": "识别结果", "confidence": 0.92 }
```

配置：

```cmd
set VOICE_ENABLED=true
set VOICE_ASR_URL=http://127.0.0.1:9001/transcribe
set VOICE_TTS_URL=http://127.0.0.1:9002/synthesize
set VOICE_TIMEOUT_SECONDS=30
```

Python 包装服务示例（FastAPI，需自行安装 funasr / torch）：

```python
from fastapi import FastAPI
from funasr import AutoModel
import base64, tempfile, os

app = FastAPI()
model = AutoModel(model="paraformer-zh-streaming", device="cuda")  # 真实部署按硬件选择

@app.post("/transcribe")
def transcribe(payload: dict):
    audio = base64.b64decode(payload["audioBase64"])
    with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as f:
        f.write(audio)
        path = f.name
    try:
        result = model.generate(input=path)
        return {"text": result[0]["text"], "confidence": 1.0}
    finally:
        os.unlink(path)
```

注意：

- 真实场景应在服务内部完成分块流式识别；后端当前接口返回最终稿，中间稿（partial）留待后续里程碑扩展；
- `confidence` 如果拿不到，返回 `1.0` 或实际模型置信度即可，低于阈值时后端仍会走占位回退。

## 三、接入真实 TTS

协议：

```text
POST {VOICE_TTS_URL}
Content-Type: application/json
{ "text": "你好呀", "emotion": "happy" | "neutral" | "sad" | ... }

200 OK
{ "audioBase64": "...", "format": "mp3" }
```

Python 包装服务示例（CosyVoice）：

```python
from fastapi import FastAPI
from cosyvoice.cli.cosyvoice import CosyVoice2
import base64, io, torchaudio

app = FastAPI()
cosyvoice = CosyVoice2("pretrained_models/CosyVoice2-0.5B", load_jit=False, load_trt=False)

@app.post("/synthesize")
def synthesize(payload: dict):
    chunks = []
    for out in cosyvoice.inference_sft(payload["text"], "中文女", stream=False):
        chunks.append(out["tts_speech"])
    buffer = io.BytesIO()
    torchaudio.save(buffer, chunks[0], cosyvoice.sample_rate, format="mp3")
    return {"audioBase64": base64.b64encode(buffer.getvalue()).decode(), "format": "mp3"}
```

只返回**一个短句**的音频时延迟最低；后端目前对每个回复整体调用一次 TTS，按句流式合成属于后续里程碑。

## 四、延迟测量

PRD 的主体验指标是：**用户说完一句话 → 客户端实际听到第一个声音**。不要用服务端的“LLM 首 token”或“TTS 首包”代替它。

建议埋点位置：

| 环节 | 建议记录 | 说明 |
|---|---|---|
| 端点检测 | `vad_end_at` | 判定用户说完的时刻 |
| 最终 ASR | `asr_final_at` | 得到最终稿的时刻 |
| LLM 首 token | `llm_first_token_at` | 适配器内记录 |
| 首个可合成句 | `first_sentence_at` | 按句切分后 |
| TTS 首个 PCM | `tts_first_chunk_at` | 适配器内记录 |
| 客户端可听首音 | `playback_started_at` | **主指标终点**，必须在客户端记录 |

主指标 = `playback_started_at - vad_end_at`；冷启动（模型首次加载）单独统计，不混入稳态 P50/P95。

## 五、其他派生存储清理

账号删除流程（`AccountDeletionService`）已内置清理端口 `AccountPurgePort`：

- ✅ Redis：`RedisAccountPurgePort`（`REDIS_ENABLED=true` 时生效），按 `sess/turn/rate/media:{userId}:*` 删除；
- ✅ 对象存储：`S3AccountPurgePort`（`STORAGE_ENABLED=true` 时生效），按 `users/{userId}/` 前缀删除；
  使用 MinIO 客户端，已通过本地 MinIO 集成测试（`S3AccountPurgePortTest`，MinIO 不可用时自动跳过）；
  阿里云 OSS 的 S3 兼容存在限制，生产接入前需核验，必要时增加 OSS 官方 SDK 适配器；
- 🚧 Milvus 向量：待实现，接入后新增一个 `AccountPurgePort` Bean 即可（当前由 `NoOpAccountPurgePort` 占位并记录日志）。

## 六、故障排查

| 现象 | 原因 | 处理 |
|---|---|---|
| 回复内容像模板 | `LLM_ENABLED` 未生效或调用失败 | 看后端日志 `LLM call failed`，检查 base-url/key/模型名 |
| 语音识别结果为空 | ASR 服务不可达或返回空 text | 后端日志 `ASR service call failed`；确认包装服务协议字段一致 |
| 语音格式为 `none` | TTS 未启用或失败 | 后端日志 `TTS service call failed`；确认 `audioBase64` 合法 |
| 首音延迟很高 | 冷启动或 TTS 未按句流式 | 预热模型；后续里程碑接入按句流式合成 |
| 端口冲突 | 后端默认 48080 | `set SERVER_PORT=<port>` 后重启 |