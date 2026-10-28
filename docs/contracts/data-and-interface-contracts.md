# 鏁版嵁涓庢帴鍙ｅ绾?
- 鐗堟湰锛歷0.1
- 閫傜敤鑼冨洿锛欳ore銆乂ision銆丮edia銆丏esktop 鐨勬湇鍔＄浣滆€呬笌璋冪敤鏂?- 閰嶅锛歔PRD](../01-product-requirements.md)銆乕鎶€鏈矾绾縘(../02-technical-roadmap.md)銆乕寮€鍙戣鑼僝(../03-development-standards.md)
- 鏈閬靛惊 [CONTEXT.md](../../CONTEXT.md)

鏈枃鏄暟鎹瓧娈典笌鎺ュ彛鐨?*鍗曚竴鏉冨▉鏉ユ簮**銆傚疄鐜颁笌鏈枃涓嶄竴鑷存椂锛屾敼瀹炵幇鎴栧厛鏀规湰鏂囧苟閫氳繃璇勫銆?
## 1. 閫氱敤绾﹀畾

### 1.1 鏍囪瘑涓庢椂闂?
- 涓婚敭锛氶洩鑺?ID锛堟暟鎹簱 `BIGINT`锛孞ava `Long`锛岃 [ADR-0005](../adr/0005-snowflake-ids.md)锛夛紝鍏ㄥ眬鍞竴锛屼笉浣滀负鎺堟潈鍑嵁锛?*API/JSON 涓墍鏈?ID 涓€寰嬩互瀛楃涓茶繑鍥烇紝閬垮厤 JavaScript 绔涪澶辩簿搴?*锛?- 褰掑睘锛氭墍鏈夌敤鎴风鏈夋暟鎹惈 `user_id`锛涚郴缁熸ā鏉胯〃锛堝 `characters` 棰勮锛夊彲涓虹┖浣嗛渶鏄惧紡鍖哄垎锛?- 鏃堕棿锛氱粺涓€ UTC锛屾暟鎹簱 `DATETIME(3)`锛涘澶?API 浣跨敤 ISO 8601锛堝甫 `Z` 鎴栧亸绉伙級锛?- 瀹¤瀛楁锛氭墍鏈変笟鍔¤〃 `created_at`銆乣updated_at`銆乣deleted_at`锛堟湭鍒犱负 `NULL`锛夛紱
- 浜嬩欢绫昏〃鍙﹀姞 `occurred_at`锛氳涓哄疄闄呭彂鐢熸椂闂达紝涓庡叆搴撴椂闂?`created_at` 鍖哄垎锛?- `updated_at` 鐢卞簲鐢ㄥ啓鍏ワ紝閬垮厤渚濊禆鏁版嵁搴撻殣寮忚涓洪€犳垚鏃跺尯涓嶄竴鑷淬€?
### 1.2 鍒犻櫎璇箟

| 璇箟 | 琛屼负 |
|---|---|
| 閫昏緫鍒犻櫎 | 缃?`deleted_at`锛屾櫘閫氭煡璇㈠繀椤昏繃婊わ紱鐢ㄤ簬甯歌涓氬姟闅愯棌 |
| 鐗╃悊鍒犻櫎 | 鐢ㄦ埛涓诲姩娓呴櫎/鍒犻櫎璐﹀彿锛岀粡 `deletion_jobs` 绾ц仈娓呯悊鍏ㄩ儴瀛樺偍 |
| 鍒犻櫎瀹¤ | 淇濈暀鏈€灏忓厓鏁版嵁锛堣皝銆佷綍鏃躲€佸垹闄や綍绫昏祫婧愶級锛屼笉鍚鏂囦笌鏂囦欢 |

閫昏緫鍒犻櫎涓嶇瓑浜庢暟鎹竻闄ゃ€備骇鍝佹枃妗堜笌鎺ュ彛鏂囨。蹇呴』鍖哄垎銆?
### 1.3 闅旂鍘熷垯

- `user_id` 浠呮潵鑷湇鍔＄璁よ瘉涓婁笅鏂囷紝**浠讳綍璇锋眰浣?鏌ヨ鍙傛暟涓殑 userId 閮戒笉浣滀负褰掑睘渚濇嵁**锛?- 鎸?ID 璇诲彇璧勬簮鏃跺繀椤诲悓鏃舵牎楠?`user_id`锛岃秺鏉冪粺涓€杩斿洖 404 鎴?403锛堜笉娉勯湶璧勬簮鏄惁瀛樺湪锛夛紱
- Redis銆丮ilvus銆佸璞″瓨鍌紙S3 鍏煎锛夈€佸紓姝ヤ换鍔°€佹棩蹇楀悓鏍锋墽琛屽綊灞炵害鏉燂紱
- 璺ㄦ湇鍔¤皟鐢ㄤ紶閫?ID锛屾帴鏀舵柟閲嶆柊鏍￠獙褰掑睘銆?
### 1.4 鍒嗛〉涓庡箓绛?
- 鍒嗛〉锛歝ursor 妯″紡锛宍limit` 榛樿 20銆佹渶澶?100锛屽搷搴斿惈 `nextCursor`锛?- 鍐欐搷浣滐細鏀寔 `Idempotency-Key` 璇锋眰澶达紝鏈嶅姟绔寜鐢ㄦ埛+閿幓閲嶏紝閲嶆斁杩斿洖棣栨缁撴灉锛?- 鏃堕棿绾挎帓搴忛粯璁?`occurred_at DESC, id DESC`銆?
## 2. 鏍稿績瀹炰綋

瀛楁鍙垪鍏抽敭椤癸紝鏈垪瀛楁鐢卞疄鐜拌ˉ鍏呬絾涓嶅緱杩濆弽閫氱敤绾﹀畾銆?
### 2.1 users

| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| username | VARCHAR(64) | 鍞竴 |
| password_hash | VARCHAR(255) | 寮哄搱甯岋紙绠楁硶瑙佸緟纭椤?C-1锛?|
| status | VARCHAR(20) | active / disabled / deleting |
| role | VARCHAR(20) | user / operator锛涢粯璁?user锛屾巿浜堜笌鎾ら攢闇€瀹¤锛圓DR-0002锛?|
| role_granted_at | DATETIME(3) | 鍙┖锛岃鑹叉渶杩戞巿浜堟椂闂?|
| last_login_at | DATETIME(3) | 鍙┖ |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

绱㈠紩锛歚UNIQUE(username)`銆乣INDEX(status)`銆乣INDEX(role)`銆?
### 2.2 characters

瑙掕壊妯℃澘涓庣増鏈紝鍏ㄥ眬鍙鏁版嵁銆?
| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| code | VARCHAR(64) | 鍞竴锛屽 `shenyouchu` |
| display_name | VARCHAR(64) | 娌堝辜妤?|
| persona_version | VARCHAR(20) | 浜鸿鐗堟湰 |
| persona_config | JSON | 浜鸿/鎻愮ず璇嶅紩鐢紝涓嶅惈瀵嗛挜 |
| is_public | BOOLEAN | 寮€婧愮増鏈粯璁?true |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

### 2.3 user_character_states

姣忎釜鐢ㄦ埛涓庤鑹蹭竴鏉″叧绯荤姸鎬併€?
| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| user_id | BIGINT | 褰掑睘 |
| character_id | BIGINT | 瑙掕壊 |
| mood | INT | 鏈夌晫鍖洪棿锛堝疄鐜板畾涔変笂涓嬮檺锛?|
| intimacy | INT | 鏈夌晫锛屽崟浜嬩欢鍙疮鍔犱竴娆?|
| state_version | BIGINT | 涔愯閿?|
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

绱㈠紩锛歚UNIQUE(user_id, character_id)`銆?
### 2.4 conversations

| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| user_id | BIGINT | 褰掑睘 |
| character_id | BIGINT | 瑙掕壊 |
| title | VARCHAR(200) | 鍙┖锛屽彲鐢遍鏉℃秷鎭敓鎴?|
| last_message_at | DATETIME(3) | 鍒楄〃鎺掑簭 |
| status | VARCHAR(20) | active / archived |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

绱㈠紩锛歚INDEX(user_id, last_message_at)`銆?
### 2.5 messages

浼氳瘽娑堟伅锛堢敤鎴蜂笌 AI 姝ｆ枃鐨勫敮涓€瀛樺偍锛夈€?
| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| conversation_id | BIGINT | 褰掑睘浼氳瘽 |
| user_id | BIGINT | 鍐椾綑褰掑睘锛岀敤浜庡己鍒舵墽琛岄殧绂?|
| turn_id | VARCHAR(36) | 鎵€灞炶疆娆?|
| role | VARCHAR(16) | user / assistant / system |
| content | MEDIUMTEXT | 姝ｆ枃 |
| content_format | VARCHAR(16) | text / markdown |
| source | VARCHAR(16) | text / voice |
| asr_confidence | DECIMAL(4,3) | 鍙┖锛岃闊虫潵婧?|
| token_count | INT | 鍙┖ |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

绱㈠紩锛歚INDEX(conversation_id, created_at)`銆乣INDEX(user_id, created_at)`銆乣INDEX(turn_id)`銆?
### 2.6 memories

缁忔暣鐞嗙殑闀挎湡璁板繂銆?
| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| user_id | BIGINT | 褰掑睘 |
| conversation_id | BIGINT | 鏉ユ簮浼氳瘽锛屽彲绌?|
| source_message_id | BIGINT | 鏉ユ簮娑堟伅锛屽彲绌?|
| memory_type | VARCHAR(32) | preference / event / relationship / other |
| content | TEXT | 璁板繂姝ｆ枃 |
| status | VARCHAR(20) | active / corrected / deleted |
| embedding_model | VARCHAR(64) | 鍙┖锛屾湭鍚戦噺鍖栨椂涓虹┖ |
| embedding_dim | INT | 鍙┖ |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

绱㈠紩锛歚INDEX(user_id, memory_type, created_at)`銆傚悜閲忔暟鎹瓨 Milvus锛宍id` 涓庢湰鏂囦竴鑷达紱**鍚戦噺妫€绱㈠繀椤绘惡甯?user_id 杩囨护**锛岀姝㈠厛鍏ㄥ眬妫€绱㈠啀搴旂敤灞傝繃婊や綔涓哄敮涓€闃茬嚎銆?
### 2.7 media_sessions

涓€娆″疄鏃跺獟浣撹繛鎺ャ€?
| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| user_id | BIGINT | 褰掑睘 |
| conversation_id | BIGINT | 鍏宠仈浼氳瘽 |
| room_ref | VARCHAR(128) | 濯掍綋鏈嶅姟鎴块棿寮曠敤锛屽敮涓€ |
| status | VARCHAR(20) | connecting / active / ended / failed |
| recording_enabled | BOOLEAN | 褰撴鏄惁褰曞埗 |
| started_at / ended_at | DATETIME(3) | 鍙┖ |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

绱㈠紩锛歚UNIQUE(room_ref)`銆乣INDEX(user_id, started_at)`銆?
### 2.8 recordings

| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| user_id | BIGINT | 褰掑睘 |
| media_session_id | BIGINT | 鏉ユ簮 |
| conversation_id | BIGINT | 鍙┖ |
| object_key | VARCHAR(512) | `users/{userId}/recordings/{recordingId}/{uuid}.mp4` |
| bucket | VARCHAR(128) | 绉佹湁妗跺悕 |
| format / duration_ms / size_bytes | VARCHAR / BIGINT | 鍏冩暟鎹?|
| status | VARCHAR(20) | recording / processing / ready / failed / deleted |
| expires_at | DATETIME(3) | 淇濈暀鏈燂紝鍙┖ |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

绾︽潫锛歚object_key` 鍙兘鐢辨湇鍔＄鐢熸垚锛涘鎴风鎻愪氦鐨勮矾寰勪竴寰嬩笉閲囦俊銆傛挱鏀捐蛋鐭湡绛惧悕 URL 鎴栧彈鎺ф祦寮忔帴鍙ｏ紝**Bucket 姘歌繙绉佹湁**銆?
### 2.9 visual_events

瑙嗚鐘舵€佸彉鍖栦笌璐ㄩ噺淇℃伅锛屼笉瀛樺師濮嬪抚涓庡叧閿偣銆?
| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| user_id | BIGINT | 褰掑睘 |
| media_session_id | BIGINT | 鏉ユ簮 |
| conversation_id | BIGINT | 鍙┖ |
| expression_estimate | VARCHAR(32) | smile_like / frown_like / surprise_like / neutral / unknown |
| posture | VARCHAR(32) | leaning_forward / leaning_back / sideways / neutral / unknown |
| camera_orientation | VARCHAR(32) | camera_oriented / away / unknown |
| confidence | DECIMAL(4,3) | 0鈥? |
| quality | VARCHAR(16) | good / low_light / occluded / no_face |
| capture_ts / inference_end_ts / emit_ts | DATETIME(3) | 淇″彿鏃跺簭 |
| model_version | VARCHAR(64) | 妯″瀷/瑙勫垯鐗堟湰 |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

鍙褰?*鐘舵€佸彉鍖?*鎴栨湁鎰忎箟浜嬩欢锛屼笉鍐欓€愬抚鏁版嵁銆備綆缃俊搴﹀啓 unknown 鎴栦笉浜х敓浜嬩欢銆?
### 2.10 activity_events

琛屼负瀹¤浜嬩欢锛屽彧璇汇€佸紩鐢ㄦ鏂囪€岄潪澶嶅埗銆?
| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| user_id | BIGINT | 鏈嶅姟绔淳鐢熷綊灞?|
| conversation_id | BIGINT | 鍙┖ |
| turn_id | VARCHAR(36) | 鍙┖ |
| event_type | VARCHAR(64) | `domain.action`锛屽 `turn.cancelled` |
| actor | VARCHAR(16) | USER / AI / SYSTEM |
| source | VARCHAR(32) | desktop / core / vision / media / system |
| occurred_at | DATETIME(3) | 琛屼负鍙戠敓鏃堕棿 |
| trace_id | VARCHAR(64) | 閾捐矾杩借釜 |
| schema_version | INT | 浜嬩欢缁撴瀯鐗堟湰 |
| payload | JSON | 浠呭繀瑕佸厓鏁版嵁涓庤祫婧?ID锛屼笉鍚鏂?甯?瀵嗛挜 |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

绱㈠紩锛歚INDEX(user_id, occurred_at)`銆乣INDEX(user_id, event_type, occurred_at)`銆乣INDEX(trace_id)`銆?
浜嬩欢绫诲瀷鍩虹嚎锛堝彲鎵╁睍锛岄渶鐧昏锛夛細`auth.login`銆乣auth.logout`銆乣device.camera_on/off`銆乣device.mic_on/off`銆乣media.session_started/ended/failed`銆乣message.sent`銆乣asr.final`銆乣turn.started/completed/cancelled/failed`銆乣visual.state_changed`銆乣memory.created/updated/deleted/recalled`銆乣recording.started/completed/deleted`銆乣search.performed`銆乣admin.search.performed`銆乣settings.changed`銆乣access.denied`銆乣data.deletion_requested/completed`銆?
`admin.search.performed` 涓哄己鍒跺璁′簨浠讹細payload 鑷冲皯鍖呭惈 `operatorUserId`銆乣reason`銆乣queryHash`锛堜笉瀛樻槑鏂囨煡璇㈣瘝锛夈€乣resultTypes`銆乣resultCount`銆乣scope`锛涚己澶辫浜嬩欢鐨勮法鐢ㄦ埛妫€绱㈣涓哄疄鐜扮己闄枫€?
### 2.11 deletion_jobs

鐗╃悊鍒犻櫎浠诲姟涓庡璁°€?
| 瀛楁 | 绫诲瀷 | 璇存槑 |
|---|---|---|
| id | BIGINT | 涓婚敭锛堥洩鑺?ID锛?|
| user_id | BIGINT | 鍙戣捣鐢ㄦ埛 |
| resource_type | VARCHAR(32) | account / conversation / recording / memory |
| resource_id | BIGINT | 鐩爣璧勬簮锛岃处鍙峰垹闄ゆ椂涓虹敤鎴?ID |
| status | VARCHAR(20) | pending / running / completed / failed |
| requested_at / completed_at | DATETIME(3) | 鍙┖ |
| error | TEXT | 鍙┖锛屼笉鍚晱鎰熸暟鎹?|
| idempotency_key | VARCHAR(64) | 鍞竴 |
| created_at / updated_at / deleted_at | DATETIME(3) | 瀹¤ |

### 2.12 鏃堕棿瀛楁鍛藉悕寰呯‘璁?
褰撳墠瑙勮寖閲囩敤 `created_at / updated_at / deleted_at / occurred_at`銆傚師濮嬮渶姹傛彁鍑?`create_date + create_time + update_date + update_time` 鍥涘瓧娈垫柟妗堬紱涓よ€呬笉娣风敤銆傛湭纭鍓嶆寜鏈鑼冨疄鐜帮紝纭鍚庣粺涓€杩佺Щ锛堣 C-6锛夈€?
## 3. REST 鎺ュ彛

鍓嶇紑 `/api/v1`銆傝韩浠芥潵鑷璇佷笂涓嬫枃锛岃矾寰勪笌鏌ヨ鍙傛暟涓嶆帴鍙楀綊灞炵敤鎴枫€?
### 3.1 璁よ瘉锛堝崰浣嶏紝鏈哄埗寰呯‘璁?C-1锛?
| 鏂规硶 | 璺緞 | 璇存槑 |
|---|---|---|
| POST | `/auth/register` | 娉ㄥ唽 |
| POST | `/auth/login` | 鐧诲綍锛岃繑鍥炵煭鏃惰闂嚟璇?|
| POST | `/auth/logout` | 閫€鍑哄苟浣垮嚟璇佸け鏁?|
| GET | `/auth/me` | 褰撳墠鐢ㄦ埛淇℃伅 |

### 3.2 浼氳瘽涓庢秷鎭?
| 鏂规硶 | 璺緞 | 璇存槑 |
|---|---|---|
| GET | `/conversations` | 褰撳墠鐢ㄦ埛浼氳瘽鍒楄〃锛坈ursor 鍒嗛〉锛?|
| POST | `/conversations` | 鍒涘缓浼氳瘽 |
| GET | `/conversations/{id}` | 璇︽儏锛堟牎楠屽綊灞烇級 |
| DELETE | `/conversations/{id}` | 鍒犻櫎锛堥€昏緫鍒犻櫎锛屽紓姝ョ墿鐞嗗垹闄ゅ彲閫夛級 |
| GET | `/conversations/{id}/messages` | 娑堟伅鍒楄〃锛坈ursor锛?|
| POST | `/conversations/{id}/turns` | 鍒涘缓杞锛堟枃鏈緭鍏ワ級锛岃繑鍥?turnId |

杞鐘舵€佷笌娴佸紡杈撳嚭閫氳繃 WebSocket 涓嬪彂锛堣绗?4 鑺傦級锛屼笉鍦?REST 涓暱杞銆?
### 3.3 璁板繂

| 鏂规硶 | 璺緞 | 璇存槑 |
|---|---|---|
| GET | `/memories` | 鍒楄〃锛堝彲鎸夌被鍨?鐘舵€佺瓫閫夛級 |
| PATCH | `/memories/{id}` | 绾犳鍐呭锛堟爣璁?corrected 骞跺啓鍏ユ柊鐗堟湰锛?|
| DELETE | `/memories/{id}` | 鍒犻櫎骞跺悓姝ョЩ闄ゅ悜閲?|

### 3.4 濯掍綋涓庡綍鍍?
| 鏂规硶 | 璺緞 | 璇存槑 |
|---|---|---|
| POST | `/media-sessions` | 鍒涘缓濯掍綋浼氳瘽锛岃繑鍥炵煭鏃舵埧闂村嚟璇佷笌 roomRef |
| POST | `/media-sessions/{id}/end` | 缁撴潫浼氳瘽 |
| GET | `/recordings` | 褰曞儚鍒楄〃 |
| GET | `/recordings/{id}/playback` | 杩斿洖鐭湡绛惧悕 URL 鎴栨祦寮忓湴鍧€锛堟牎楠屽綊灞烇級 |
| DELETE | `/recordings/{id}` | 鍒犻櫎鏂囦欢涓庡厓鏁版嵁 |

### 3.5 娲诲姩璁板綍

| 鏂规硶 | 璺緞 | 璇存槑 |
|---|---|---|
| GET | `/activity-events` | 鏃堕棿绾挎煡璇紙鎸夌被鍨嬨€佹椂闂磋寖鍥寸瓫閫夛級 |

鍙锛涗笉鎻愪緵鏅€氱敤鎴蜂慨鏀规帴鍙ｃ€?
### 3.6 璁剧疆涓庢暟鎹潈鍒?
| 鏂规硶 | 璺緞 | 璇存槑 |
|---|---|---|
| GET | `/settings` | 鑾峰彇璁剧疆锛堝綍鍒跺紑鍏炽€佽拷韪紑鍏充笌绾у埆銆佷繚鐣欐湡锛?|
| PATCH | `/settings` | 鏇存柊璁剧疆锛屽啓鍏ユ椿鍔ㄤ簨浠?|
| POST | `/data/deletion-requests` | 璇锋眰鍒犻櫎璐﹀彿鎴栨寚瀹氳祫婧愶紝杩斿洖 jobId |
| GET | `/data/deletion-requests/{jobId}` | 鏌ヨ鍒犻櫎杩涘害 |

### 3.7 鎼滅储

| 鏂规硶 | 璺緞 | 璇存槑 |
|---|---|---|
| POST | `/search` | 鐢ㄦ埛鎼滅储鏈汉璁板綍锛沚ody 鍚?`query`銆乣types`銆乣from`銆乣to`銆乣cursor`銆乣limit` |
| POST | `/admin/search` | 杩愯惀璺ㄧ敤鎴锋绱紱浠?`operator` 瑙掕壊锛宐ody 蹇呴』鍚?`reason`锛岄粯璁よ劚鏁?|

鎼滅储浣跨敤 POST + body 鑰岄潪 GET 鏌ヨ涓诧紝閬垮厤鎼滅储璇嶈繘鍏?URL銆佹祻瑙堝櫒鍘嗗彶涓庤闂棩蹇楋紱璇ユ帴鍙ｆ槸鍙鏌ヨ锛屼笉闇€瑕?`Idempotency-Key`銆?
鐢ㄦ埛鎼滅储鍝嶅簲锛?
```json
{
  "items": [
    {
      "entityType": "message",
      "entityId": "msg-...",
      "conversationId": "conv-...",
      "occurredAt": "2026-10-27T09:00:00.000Z",
      "snippet": "鈥︹€﹂珮浜墖娈碘€︹€?,
      "score": 0.87
    }
  ],
  "nextCursor": null
}
```

瑙勫垯锛?
- `entityType` 鍙栧€?`message`銆乣memory`銆乣activity`銆乣recording`锛?- 鐢ㄦ埛鎼滅储寮哄埗鎸夎璇佺敤鎴疯繃婊わ紱杩愯惀妫€绱㈢殑鐢ㄦ埛鑼冨洿鐢辨湇鍔＄鎺堟潈鍐冲畾锛?*涓嶆帴鍙楀鎴风浼犲叆浠绘剰 userId**锛?- 宸插垹闄わ紙`deleted_at` 闈炵┖锛夋垨鏉冨▉璁板綍宸蹭笉瀛樺湪鐨勬枃妗ｄ笉寰楄繑鍥烇紱绱㈠紩涓烘淳鐢熸暟鎹椂闇€鍥炴簮鏍￠獙锛?- 杩愯惀妫€绱㈠搷搴旈粯璁や笉鍚畬鏁存鏂囷紝浠呮憳瑕佷笌鍏冩暟鎹紱姣忔璋冪敤鍐欏叆 `admin.search.performed`锛?- 缂哄皯瑙掕壊銆佺己灏戜簨鐢辨垨瓒呭嚭鎺堟潈鑼冨洿鍒嗗埆杩斿洖 403銆乣REASON_REQUIRED`銆?03銆?
`SearchPort` 鎺ュ彛锛圕ore 鍐呴儴 seam锛夛細

```text
search(query, scope, types, timeRange, cursor) -> SearchPage
index(document) / remove(entityType, entityId)
rebuild(scope)
```

P1 瀹炵幇 `MySqlSearchAdapter`锛團ULLTEXT + ngram锛夛紱鍚庣画鍙鍔?`OpenSearchAdapter`锛屼笟鍔′唬鐮佷笌鎺ュ彛涓嶅彉銆傛湭鏉ョ储寮曟枃妗ｅ瓧娈电害瀹氫负锛歚docId`銆乣userId`銆乣entityType`銆乣entityId`銆乣conversationId`銆乣actor`銆乣content`銆乣occurredAt`銆乣deleted`銆乣schemaVersion`銆乣updatedAt`銆?
### 3.8 閿欒鏍煎紡

```json
{
  "code": "TURN_ALREADY_CANCELLED",
  "message": "鏈疆瀵硅瘽宸插彇娑?,
  "requestId": "req-...",
  "details": {}
}
```

甯哥敤鐮侊細`UNAUTHENTICATED`(401)銆乣FORBIDDEN`(403)銆乣NOT_FOUND`(404)銆乣VALIDATION_FAILED`(400)銆乣CONFLICT`(409)銆乣RATE_LIMITED`(429)銆乣UPSTREAM_UNAVAILABLE`(503)銆乣TURN_ALREADY_CANCELLED`(409)銆乣RECORDING_NOT_READY`(409)銆乣REASON_REQUIRED`(400)銆乣SEARCH_UNAVAILABLE`(503)銆傝秺鏉冭祫婧愮粺涓€杩斿洖 404锛岄伩鍏嶆硠闇插瓨鍦ㄦ€с€?
### 3.9 骞傜瓑涓庨噸璇?
- 鎵€鏈?POST/PATCH/DELETE 鏀寔 `Idempotency-Key`锛?- 閲嶈瘯涓嶅緱浜х敓閲嶅娑堟伅銆侀噸澶嶈蹇嗘垨閲嶅鍒犻櫎浠诲姟锛?- 涓婃父瓒呮椂鎸夊彲閲嶈瘯涓庝笉鍙噸璇曞垎绫伙紝閲嶈瘯鏈夋鏁颁笌閫€閬夸笂闄愩€?
## 4. 瀹炴椂鍗忚锛圵ebSocket锛?
### 4.1 杩炴帴涓庨壌鏉?
- 杩炴帴鏃舵惡甯︾煭鏃剁エ鎹紙鐢?`/auth/login` 鎴栦笓鐢ㄦ帴鍙ｇ鍙戯級锛屾湇鍔＄鏍￠獙骞剁粦瀹?userId锛?- 杩炴帴缁戝畾 `connectionId`锛屾柇绾块噸杩炲悗鎸?`turnId` 鎭㈠鎴栨槑纭け璐ワ紱
- 鍗忚鐗堟湰閫氳繃 `schemaVersion` 鍗忓晢銆?
### 4.2 浜嬩欢淇″皝

```json
{
  "eventId": "evt-...",
  "type": "asr.final",
  "schemaVersion": 1,
  "conversationId": "conv-...",
  "turnId": "turn-...",
  "sequence": 42,
  "occurredAt": "2026-10-27T09:00:00.000Z",
  "payload": {}
}
```

瑙勫垯锛氬鎴风涓庢湇鍔＄閮戒涪寮冭繃鏈?`sequence`锛沗turnId` 涓嶅尮閰嶇殑娑堟伅鐩存帴蹇界暐銆?
### 4.3 瀹㈡埛绔?鈫?鏈嶅姟绔?
| type | payload | 璇存槑 |
|---|---|---|
| `speech.start` | `{ "conversationId": "..." }` | 寮€濮嬩竴杞闊?|
| `audio.chunk` | 浜岃繘鍒跺抚 + 鍏冩暟鎹紙seq銆乼s锛?| 闊抽鍒嗙墖锛屼紭鍏堜簩杩涘埗閫氶亾 |
| `speech.end` | `{ "turnId": "..." }` | 缁撴潫杈撳叆锛岃姹傛渶缁堢 |
| `turn.cancel` | `{ "turnId": "..." }` | 鍙栨秷鏈疆锛堝箓绛夛級 |
| `text.send` | `{ "conversationId": "...", "text": "..." }` | 鏂囨湰杈撳叆 |

### 4.4 鏈嶅姟绔?鈫?瀹㈡埛绔?
| type | payload | 璇存槑 |
|---|---|---|
| `turn.started` | `{ "turnId": "..." }` | 宸叉帴鍙楄疆娆?|
| `asr.partial` | `{ "text": "...", "confidence": 0.8 }` | 浠呯敤浜庡瓧骞?|
| `asr.final` | `{ "text": "...", "confidence": 0.9 }` | 鏈€缁堢锛岃Е鍙戝洖绛?|
| `assistant.text.delta` | `{ "delta": "..." }` | 娴佸紡鏂囨湰 |
| `assistant.audio.chunk` | 浜岃繘鍒堕煶棰?+ `{ seq, format, sampleRate }` | 鎸?seq 椤哄簭鎾斁 |
| `assistant.playback.started` | `{ "firstAudioAt": "..." }` | 鐢ㄤ簬棣栭煶寤惰繜缁熻 |
| `visual.signal` | VisualSignal锛堢 5 鑺傦級 | 浣庨蹇収鎴栧彉鍖栦簨浠?|
| `turn.completed` | `{ "turnId": "...", "reason": "done" }` | 姝ｅ父缁撴潫 |
| `turn.cancelled` | `{ "turnId": "...", "reason": "user" }` | 宸插彇娑堬紝瀹㈡埛绔竻绌洪槦鍒?|
| `turn.failed` | `{ "code": "...", "message": "..." }` | 澶辫触涓庨檷绾ф彁绀?|

闊抽缂栫爜銆佸抚澶у皬涓庝簩杩涘埗澶存牸寮忛殢濯掍綋閫夊瀷纭畾锛圕-2锛夛紝鏈枃浠跺彧绾﹀畾"浜岃繘鍒堕€氶亾 + seq + 鏃堕棿鎴?鐨勫绾﹀眰绾с€?
## 5. VisualSignal 濂戠害锛圕ore 鈫?Vision锛?
```json
{
  "signalId": "vs-...",
  "userId": "u-...",
  "mediaSessionId": "ms-...",
  "conversationId": "conv-...",
  "expressionEstimate": "smile_like",
  "posture": "leaning_forward",
  "cameraOrientation": "camera_oriented",
  "confidence": 0.82,
  "quality": "good",
  "captureTs": "2026-10-27T09:00:00.100Z",
  "inferenceEndTs": "2026-10-27T09:00:00.150Z",
  "emitTs": "2026-10-27T09:00:00.180Z",
  "sequence": 1024,
  "modelVersion": "mediapipe-...",
  "schemaVersion": 1
}
```

绾︽潫锛?
- `userId` 鏉ヨ嚜鏈嶅姟绔獟浣撲細璇濈粦瀹氾紝涓嶆帴鍙?Vision worker 浠绘剰澹版槑锛?- 鍙緭鍑轰及璁″€硷紝涓嶈緭鍑鸿韩浠姐€佸績鐞嗙粨璁猴紱
- 缃俊搴︿綆浜庨槇鍊兼垨璐ㄩ噺涓嶄匠鏃惰緭鍑?`unknown` / `quality=low_light|occluded|no_face`锛?- Core 鍙繚鐣欐渶鏂板揩鐓э紙榛樿 2Hz锛変笌鍙樺寲浜嬩欢锛屼笉鎺掗槦鍥炴斁鏃у抚淇″彿锛?- 娉ㄥ叆鎻愮ず璇嶆椂闄勫甫"浼拌"鎺緸涓庣疆淇″害锛屼綆缃俊搴︿笉娉ㄥ叆銆?
## 6. 妯″瀷閫傞厤鎺ュ彛

鎵€鏈夐€傞厤鍣ㄤ互"灏忔帴鍙?鏆撮湶锛屼緵搴斿晢瀹炵幇鍙浛鎹細

| 鎺ュ彛 | 杈撳叆 | 杈撳嚭 | 鍏抽敭绾︽潫 |
|---|---|---|---|
| AsrAdapter | 闊抽娴?| partial / final 鏂囨湰 + 缃俊搴?| partial 涓嶈Е鍙戝洖绛?|
| LlmAdapter | 绯荤粺鎻愮ず銆佷笂涓嬫枃銆佹秷鎭€佸彇娑堜俊鍙?| 鏂囨湰澧為噺娴?| 鏀寔鍙栨秷锛涢 token 鍩嬬偣 |
| TtsAdapter | 鏂囨湰鐗囨锛堝彞绾э級 | 闊抽鍧楁祦 | 鏀寔鍙栨秷锛涙寜搴忚繑鍥?|
| EmbeddingAdapter | 鏂囨湰鍒楄〃 | 鍚戦噺 + 妯″瀷鍚?缁村害 | 缁村害鍙樻洿闇€閲嶅缓绱㈠紩 |
| VisionAdapter锛堝唴閮級 | 甯ф垨濯掍綋寮曠敤 | VisualSignal | 涓㈠抚浼樺厛浜庡爢绉?|

缁熶竴瑕佹眰锛氳秴鏃躲€侀噸璇曘€侀檷绾с€佸箓绛夈€佸彲瑙傛祴锛涙ā鍨?ID 涓庡瘑閽ユ潵鑷厤缃紱濂戠害娴嬭瘯瑕嗙洊姝ｅ父銆佽秴鏃躲€佸彇娑堜笌閿欒鏄犲皠銆?
## 7. 瀛樺偍涓庨殧绂诲绾?
### 7.1 Redis

```text
sess:{userId}:{conversationId}          # 浼氳瘽涓存椂鐘舵€侊紝TTL
turn:{userId}:{turnId}                  # 杞鐘舵€侊紝TTL
rate:{userId}:{action}:{window}         # 闄愭祦
media:{userId}:{mediaSessionId}         # 濯掍綋缁戝畾锛孴TL
```

瑙勫垯锛氬鎴风涓嶅彲鐩存帴璁块棶锛涘彧瀛樹复鏃剁姸鎬侊紱涓嶆妸 Redis 褰撴潈濞佷簨瀹炴簮銆?
### 7.2 Milvus

- 姣忔潯鍚戦噺鍚?`user_id` 鏍囬噺瀛楁锛?- 妫€绱㈠繀椤绘惡甯?`user_id == 褰撳墠鐢ㄦ埛` 杩囨护鏉′欢锛?- 缁村害涓庢ā鍨嬪悕闅?Embedding 閫傞厤鍣ㄧ増鏈褰曪紝绂佹娣风敤涓嶅悓缁村害绱㈠紩锛?- 鍒犻櫎璁板繂鏃跺悓姝ュ垹闄ゅ悜閲忥紙鎴栨爣璁板苟寮傛娓呯悊锛岄渶鍙獙璇侊級銆?
### 7.3 瀵硅薄瀛樺偍锛圫3 鍏煎锛?
- Bucket 绉佹湁锛?- 瀵硅薄 Key 瑙勮寖锛歚users/{userId}/recordings/{recordingId}/{uuid}.mp4`锛?- 涓嬭浇鍓嶆牎楠?`recordings.user_id`锛屽啀绛惧彂鐭湡 URL锛?- 璐﹀彿鍒犻櫎鏃舵寜鍓嶇紑娓呯悊骞舵牎楠岀粨鏋溿€?
## 8. 鏁版嵁鍒犻櫎鐭╅樀

| 瀛樺偍 | 璐﹀彿鍒犻櫎 | 鍗曟潯褰曞儚鍒犻櫎 | 鍗曟潯璁板繂鍒犻櫎 | 鍗曚細璇濆垹闄?|
|---|---|---|---|---|
| MySQL | 鍒犻櫎/鍖垮悕鍖栫敤鎴风浉鍏宠 | 鍒犻櫎 recordings 琛?| 鍒犻櫎 memories 琛?| 绾ц仈 messages 绛?|
| Redis | 鍒犻櫎鐢ㄦ埛鍓嶇紑 Key | 娓呯悊鐩稿叧涓存椂鐘舵€?| 娓呯悊鍙洖缂撳瓨 | 娓呯悊浼氳瘽鐘舵€?|
| Milvus | 鎸?user_id 鍒犻櫎鍚戦噺 | 鏃?| 鍒犻櫎瀵瑰簲鍚戦噺 | 鍒犻櫎鍏宠仈璁板繂鍚戦噺 |
| 瀵硅薄瀛樺偍锛圫3 鍏煎锛?| 娓呯悊 `users/{userId}/` 鍓嶇紑 | 鍒犻櫎瀵硅薄 | 鏃?| 鍙€夊垹闄ゅ叧鑱斿綍鍍?|
| 寮傛浠诲姟 | 鍙栨秷/娓呯悊寰呮墽琛屼换鍔?| 鍙栨秷褰掓。浠诲姟 | 鏃?| 鍙栨秷鏁寸悊浠诲姟 |
| 鏃ュ織/瀹¤ | 淇濈暀鏈€灏忓垹闄ゅ璁?| 璁板綍鍒犻櫎浜嬩欢 | 璁板綍鍒犻櫎浜嬩欢 | 璁板綍鍒犻櫎浜嬩欢 |

姣忛」蹇呴』鏈夎嚜鍔ㄥ寲楠岃瘉锛涘垹闄や换鍔″彲閲嶈瘯涓斿箓绛夛紝瀹屾垚鍚庡啓鍏?`data.deletion_completed` 浜嬩欢銆?
## 9. 闅旂濂戠害娴嬭瘯瑕佹眰

鍙戝竷闂ㄧ蹇呴』瑕嗙洊锛?
1. A 鐨勫嚟璇佽鍙?B 鐨勪細璇?娑堟伅/璁板繂/褰曞儚/娲诲姩浜嬩欢 鈫?鎷掔粷锛?2. A 浼犲叆 B 鐨?userId 鎴栬祫婧?ID 鈫?涓嶄骇鐢熻秺鏉冭闂紱
3. A 鏃犳硶鑾峰彇鎴栧鐢?B 鐨勫獟浣撴埧闂村嚟璇佷笌绛惧悕 URL锛?4. A 鍙栨秷 B 鐨勮疆娆?鈫?鎷掔粷涓?B 鐨勮疆娆′笉鍙楀奖鍝嶏紱
5. 鍚戦噺妫€绱笉杩斿洖浠栦汉璁板繂锛堝惈杈圭晫锛氱浉鍚屾枃鏈€佺浉鍚?embedding锛夛紱
6. 寮傛浠诲姟涓茬嚎娴嬭瘯锛欰 鐨勮繜鍒?ASR/璁板繂浠诲姟涓嶅啓鍏?B锛?7. 鍒犻櫎鐭╅樀閫愰」楠岃瘉鏃犳畫鐣欙紱鎼滅储绱㈠紩鍦ㄥ垹闄ゅ悗涓嶅啀杩斿洖璇ュ唴瀹癸紱
8. 鏃ュ織涓庨敊璇綋涓嶆硠闇蹭粬浜鸿祫婧愬瓨鍦ㄦ€ф垨鏁忔劅鍐呭锛?9. A 鐨勬悳绱㈡煡璇㈡案杩滀笉杩斿洖 B 鐨勬秷鎭€佽蹇嗐€佹椿鍔ㄦ垨褰曞儚鍏冩暟鎹紱
10. `operator` 缂哄皯瑙掕壊銆佺己灏戜簨鐢辨垨瓒呭嚭鎺堟潈鑼冨洿鏃舵绱㈣鎷掔粷锛屼笖涓嶄骇鐢熶换浣曞懡涓紱
11. 姣忔鎴愬姛鐨勮繍钀ユ绱㈤兘瀛樺湪 `admin.search.performed` 瀹¤浜嬩欢锛屽瓧娈靛畬鏁淬€?
## 10. 闅愮鍒嗙骇

| 绾у埆 | 鏁版嵁 | 瑕佹眰 |
|---|---|---|
| 楂?| 瀵嗙爜鍝堝笇銆佸璇濇鏂囥€佽蹇嗐€佸綍鍍忋€侀煶棰?| 鍔犲瘑浼犺緭锛屾渶灏忚闂紝鍒犻櫎鍙骇鑱旓紝绂佹杩涙棩蹇?|
| 涓?| 瑙嗚浼拌銆佹椿鍔ㄤ簨浠躲€佸叧绯荤姸鎬?| 褰掑睘鏄庣‘锛屼繚鐣欐湡锛岄粯璁や笉鍏紑 |
| 浣?| 瑙掕壊妯℃澘銆佹ā鍨嬮厤缃€佸叕寮€鏂囨。 | 鍙叕寮€ |

鎼滅储璁块棶瑙勫垯锛圓DR-0002锛夛細

- 鐢ㄦ埛鎼滅储鍙兘鍛戒腑鏈汉鏁版嵁锛?- `operator` 璺ㄧ敤鎴锋绱㈠繀椤诲甫浜嬬敱锛岄粯璁よ劚鏁忥紝骞跺己鍒跺啓鍏ュ璁′簨浠讹紱
- 鎼滅储绱㈠紩灞炰簬娲剧敓鏁版嵁锛岀户鎵胯绱㈠紩鏁版嵁鐨勯殣绉佺骇鍒紱绱㈠紩蹇収銆佹棩蹇椾笌璋冭瘯杈撳嚭鍚屾牱涓嶅緱娉勯湶姝ｆ枃銆?
## 11. 寰呯‘璁ら」

| 缂栧彿 | 闂 | 榛樿寤鸿 |
|---|---|---|
| C-1 | 璁よ瘉鏈哄埗涓庡瘑鐮佸搱甯岀畻娉?| 鏈湴璐﹀彿 + 寮哄搱甯岋紙濡?Argon2id/bcrypt 涔嬩竴锛夛紝鍒濆鍖栨椂閿佸畾 |
| C-2 | 闊抽甯т笌浜岃繘鍒跺崗璁粏鑺?| 闅忓獟浣撻€夊瀷 POC 纭畾锛屼繚鎸?seq+ts 濂戠害 |
| C-3 | 鍚勬暟鎹繚鐣欐湡榛樿鍊?| 褰曞儚 30 澶┿€佹椿鍔?90 澶╋紝鐢ㄦ埛鍙皟 |
| C-4 | Milvus 绱㈠紩鍙傛暟涓庣淮搴?| 闅?Embedding 妯″瀷纭鍚庨攣瀹氾紝鍙樻洿璧伴噸寤烘祦绋?|
| C-5 | 褰曞儚鍔犲瘑涓庡浠界瓥鐣?| 鏈嶅姟绔姞瀵?+ 瀹氭湡澶囦唤锛屽叿浣撴柟妗堥儴缃查樁娈靛畾 |
| C-6 | 鏃堕棿瀛楁鍛藉悕锛堝洓瀛楁 vs `*_at`锛?| 鏈鑼冪粺涓€ `created_at/updated_at/deleted_at/occurred_at`锛屽闇€鍥涘瓧娈甸渶缁熶竴杩佺Щ璇勫 |
| C-7 | 濯掍綋鏈嶅姟 SDK 涓庢埧闂村嚟璇佹牸寮?| POC 鍚庣‘瀹氾紝椤绘弧瓒虫湇鍔＄绛惧彂涓庢渶灏忔潈闄?|
| C-8 | `operator` 瑙掕壊妯″瀷涓庢巿鏉冩祦绋?| 鐙珛瑙掕壊銆佸鎵规巿浜堛€佸彲鎾ら攢锛涜 ADR-0002 |
| C-9 | 杩愯惀妫€绱㈣劚鏁忚鍒欎笌鍙睍绀哄瓧娈?| 榛樿浠呮憳瑕佷笌鍏冩暟鎹紝姝ｆ枃灞曠ず闇€鍗曠嫭鎺堟潈骞剁暀鐥?|
| C-10 | 鎼滅储绱㈠紩瀹炵幇涓庡垏鎹㈡椂鐐?| P1 MySQL FULLTEXT/ngram锛屽懡涓川閲忔垨寤惰繜涓嶈揪鏍囨椂鍒?OpenSearch |

