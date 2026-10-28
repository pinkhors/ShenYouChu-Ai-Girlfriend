# scripts/

璺ㄥ墠鍚庣鐨勫紑鍙戜笌楠屾敹鑴氭湰銆傝繖閲屽彧鏀捐剼鏈紝涓嶆斁浠讳綍鍖呯鐞嗘枃浠讹紙`package.json`銆侀攣鏂囦欢銆乣node_modules` 涓€寰嬪睘浜庡悇鑷殑 `apps/*`锛夈€?
| 鑴氭湰 | 鐢ㄩ€?| 渚濊禆 |
|---|---|---|
| `pull-images.ps1` | 鎷夊彇鏈湴寮€鍙戦暅鍍忥紱`-Full` 杩藉姞 etcd銆丮ilvus銆乴egacy MinIO | Docker Desktop |
| `pull-images.sh` | 鍚屼笂锛孏it Bash / WSL 鐗堟湰 | Docker Desktop |
| `verify-m0.ps1` | 鍚庣 M0 绔埌绔獙鏀讹細鍋ュ悍妫€鏌ャ€佹敞鍐屻€佷細璇濊秺鏉?404銆侀噸澶嶆敞鍐?409銆佸尶鍚?401 | 鍚庣杩愯鍦?`http://127.0.0.1:48080` |
| `verify-m1.ps1` | 鍚庣 M1 楠屾敹锛氳疆娆°€佹秷鎭€佽蹇嗐€佹椿鍔ㄤ簨浠躲€佽秺鏉冦€丼SE 娴佸紡 | 鍚屼笂 |
| `verify-m2.ps1` | 鍚庣 M2 楠屾敹锛氳闊冲崰浣嶉摼璺紙ASR鈫掕疆娆♀啋TTS锛夈€侀潪娉?Base64銆佽秺鏉?| 鍚屼笂 |

## 浣跨敤

```powershell
# 闀滃儚
powershell -ExecutionPolicy Bypass -File scripts\pull-images.ps1 -Full

# 鍚庣楠屾敹锛堟湇鍔￠渶宸插惎鍔級
powershell -ExecutionPolicy Bypass -File scripts\verify-m0.ps1
```

## 鍛藉悕绾﹀畾

- `verify-<閲岀▼纰?.ps1`锛氱鍒扮楠屾敹鑴氭湰锛屽け璐ユ椂杩斿洖闈為浂閫€鍑虹爜锛?- `pull-*`銆乣init-*`銆乣reset-*`锛氱幆澧冨噯澶囩被鑴氭湰锛?- 鏂板鑴氭湰蹇呴』鍦ㄦ湰鏂囦欢鐧昏鐢ㄩ€斾笌鍓嶇疆鏉′欢锛?- 鑴氭湰浜х敓鐨勭紦瀛樸€佹棩蹇椼€佹暟鎹洰褰曚竴寰嬪啓鍏?`.gitignore`锛屼笉寰楁彁浜ゃ€?

