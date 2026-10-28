# ShenYouChu AI Girlfriend

澶氫汉鍚勮嚜涓?AI 瑙掕壊**娌堝辜妤?*杩涜涓€瀵逛竴鏂囨湰銆佽闊冲拰瑙嗛闄即鐨勬闈㈠簲鐢ㄩ」鐩€?
褰撳墠澶勪簬 **M0 鍦板熀闃舵**锛氭枃妗ｅ熀绾垮凡瀹屾垚锛屾牳蹇冩湇鍔￠鏋讹紙璁よ瘉銆佷細璇濆綊灞炪€佹椿鍔ㄤ簨浠躲€佹暟鎹簱杩佺Щ锛夊彲鏋勫缓锛涙闈㈢灏氭湭鍒涘缓銆?
## 蹇€熷紑濮?
鍓嶇疆锛欽DK 17銆丮aven 3.9+銆丏ocker Desktop銆?
```bash
# 1. 鍚姩 M0 鍩虹璁炬柦锛圡ySQL 43306 / Redis 46379锛?docker compose up -d

# 鍙€夛細瀹屾暣鏍堬紙杩藉姞 Milvus 49530 涓?S3 瀵硅薄瀛樺偍 49000-49001锛屾湰鍦颁负 legacy MinIO锛?# docker compose --profile full up -d

# 2. 鏋勫缓骞惰繍琛屾牳蹇冩湇鍔★紙Flyway 鑷姩寤鸿〃锛?mvn -B spring-boot:run -pl services/core

# 3. 鍋ュ悍妫€鏌?curl http://127.0.0.1:8080/actuator/health
```

鏍稿績鎺ュ彛锛堝墠缂€ `/api/v1`锛夛細

```text
POST /auth/register   娉ㄥ唽骞惰繑鍥炰細璇?token
POST /auth/login      鐧诲綍
POST /auth/logout     閫€鍑猴紙Bearer token锛?GET  /auth/me         褰撳墠鐢ㄦ埛
GET  /characters      鍐呯疆瑙掕壊锛堟矆骞兼锛?GET/POST /conversations           浼氳瘽鍒楄〃/鍒涘缓
GET/DELETE /conversations/{id}    浼氳瘽璇︽儏/鍒犻櫎锛堝綊灞炴牎楠岋級
POST /conversations/{id}/turns         鏂囨湰杞锛堜汉璁惧洖澶?+ 璁板繂 + 娲诲姩浜嬩欢锛?POST /conversations/{id}/turns/stream  SSE 娴佸紡杞锛坱urn.started / assistant.text.delta / turn.completed锛?GET  /conversations/{id}/messages      浼氳瘽娑堟伅
POST /conversations/{id}/voice-turns   璇煶杞锛圡2 楠ㄦ灦锛欰SR 鈫?杞 鈫?TTS锛?GET/DELETE /memories                   璁板繂鍒楄〃 / 鍒犻櫎
GET  /activity-events                  娲诲姩璁板綍锛堝彲鎸夌被鍨嬬瓫閫夛級
```

## 鏂囨。

- [鏂囨。绱㈠紩](./docs/README.md)
- [浜у搧闇€姹傛枃妗ｏ紙PRD锛塢(./docs/01-product-requirements.md)
- [鎶€鏈疄鐜拌矾绾縘(./docs/02-technical-roadmap.md)
- [寮€鍙戣鑼僝(./docs/03-development-standards.md)
- [鏁版嵁涓庢帴鍙ｅ绾(./docs/contracts/data-and-interface-contracts.md)
- [鏋舵瀯鍐崇瓥璁板綍锛圓DR锛塢(./docs/adr/0001-frontend-react.md)锛堝彟瑙?[ADR-0002 杩愯惀妫€绱㈣竟鐣宂(./docs/adr/0002-operator-search-audit.md)銆乕ADR-0003 MyBatis-Plus 鎸佷箙鍖朷(./docs/adr/0003-mybatis-plus-persistence.md)銆乕ADR-0004 鏈湴瀵硅薄瀛樺偍](./docs/adr/0004-local-object-storage-minio-legacy.md)锛?- [鏈琛╙(./CONTEXT.md)

鍘熷鎰挎櫙鏂囨。锛歔ShenYouChu-Ai-Girlfriend-浜у搧闇€姹傛枃妗RD.docx](./ShenYouChu-Ai-Girlfriend-浜у搧闇€姹傛枃妗RD.docx)锛堝巻鍙插弬鑰冿紝涓嶄綔涓哄疄鐜颁緷鎹級銆?
## 宸茬‘瀹氱殑鏂瑰悜

- 妗岄潰绔?Electron + React + TypeScript锛?- 鏍稿績瀵硅瘽鏈嶅姟 Spring Boot 3.x + Java 17锛屾寔涔呭寲缁熶竴浣跨敤 MyBatis-Plus锛孏ateway/Identity 鍒濇湡鍚岃繘绋嬪垎妯″潡锛?- 濯掍綋涓庤瑙夌嫭绔嬮儴缃诧細WebRTC + Python MediaPipe锛?- 妯″瀷鍏堜娇鐢ㄤ簯 API锛屾帴鍙ｅ彲鏇挎崲锛屽悗缁敮鎸佽嚜鎵樼锛?- 鏈湴 Docker 鍚姩 MySQL銆丷edis锛汳ilvus 涓?S3 鍏煎瀵硅薄瀛樺偍锛堟湰鍦?legacy MinIO锛夋斁鍦?`full` profile锛屽悗缁縼绉讳簯鏈嶅姟鍣紱
- 闈㈠悜寮€婧愪笌澶氫汉浣跨敤锛屾暟鎹粠绗竴鐗堝紑濮嬩弗鏍奸殧绂伙紱
- 褰曞儚缁忔巿鏉冧繚瀛樺埌绉佹湁 S3 瀵硅薄瀛樺偍锛屽疄鏃堕摼璺笌褰掓。鍒嗙锛?- 鍏ㄥ眬鎼滅储鍒嗕袱绫伙細鐢ㄦ埛鎼滅储鑷繁鐨勮褰曪紙P1锛屽厛 MySQL 鍏ㄦ枃锛夛紝杩愯惀璺ㄧ敤鎴锋绱紙P2锛屽彈鎺с€佽劚鏁忋€佸繀椤诲璁★級锛屽悗缁彲鍒囨崲 OpenSearch銆?
## 浠撳簱缁撴瀯

```text
pom.xml                     # 鐖?POM锛岃仛鍚?Java 妯″潡
docker-compose.yaml         # 鏈湴鍩虹璁炬柦锛堥粯璁?MySQL/Redis锛宖ull profile 鍚?Milvus/MinIO锛?services/core/              # Spring Boot 鏍稿績鏈嶅姟
apps/desktop/               # Electron + React + TypeScript 妗岄潰绔?docs/                       # PRD銆佹妧鏈矾绾裤€佸紑鍙戣鑼冦€佸绾︺€丄DR
scripts/                    # 闀滃儚鎷夊彇涓?M0 楠岃瘉鑴氭湰
```

## 鐘舵€?
M0 杩涜涓細

- 鏍稿績鏈嶅姟宸插湪鏈湴 MySQL 涓婂畬鎴愮湡瀹炶仈璋冿細鍋ュ悍妫€鏌ャ€佹敞鍐?鐧诲綍銆佷細璇濆綊灞為殧绂伙紙璺ㄧ敤鎴?404锛夈€侀噸澶嶆敞鍐?409銆佸尶鍚?401 鍏ㄩ儴閫氳繃锛岄獙璇佽剼鏈 `scripts/verify-m0.ps1`锛?- 鍩虹璁炬柦 Compose 鏀寔榛樿锛圡ySQL/Redis锛変笌 `full`锛圡ilvus + legacy MinIO锛変袱绉?profile锛?- 妗岄潰绔鏋舵鍦ㄦ惌寤猴紝瀹屾垚鍚庡彲鐧诲綍骞剁鐞嗕細璇濄€?
鏈喅闂瑙佸悇鏂囨。鐨勩€屽緟纭椤广€嶏紝鍧囩粰鍑洪粯璁ゅ缓璁紝涓嶉樆濉炲紑鍙戙€?
