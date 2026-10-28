package com.shenyouchu.core.voice;

/** 语音识别 seam：真实实现接 FunASR / Paraformer，占位实现用于离线演示。 */
public interface AsrAdapter {

    AsrResult transcribe(byte[] audio, String contentType);
}
