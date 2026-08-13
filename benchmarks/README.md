# Podcast ASR benchmark

Committed manifests and aggregate results are checked without downloading media:

```sh
pnpm check:benchmarks
```

Ulpaso의 실제 설정과 같은 2초 스트리밍 디코드와 20초 고정밀 보정을 비교한다. 각 샘플은 앞 120초이며 음원과 자막 원문은 저장소에 포함하지 않는다.

- `podcast_samples.json`: 재현 가능한 YouTube 샘플과 자막 종류
- `latest_results.json`: 전사 원문을 제외한 최신 수치
- 수동 자막만 신뢰 지표 평균에 포함하고, 자동 원본 자막은 참고 지표로만 사용한다.

로컬 WAV/JSON3 파일을 준비한 뒤 앱에 포함된 Python과 모델로 실행한다.

`yt-dlp`와 `ffmpeg`가 설치되어 있으면 manifest에 고정된 URL·자막 종류·파일명으로 임시 자산을 준비할 수 있다. 다운로드한 미디어는 재배포하지 말고 원 저작자의 이용 조건을 따른다.

```sh
python3 scripts/prepare_benchmark_assets.py \
  --manifest benchmarks/podcast_samples.json \
  --assets-dir /tmp/ulpaso-podcast-benchmark
```

```sh
src-tauri/target/debug/resources/asr-runtime/bin/python3 \
  scripts/podcast_asr_benchmark.py \
  --assets-dir /tmp/ulpaso-podcast-benchmark \
  --model "$HOME/Library/Application Support/app.ulpaso.editor/Models/qwen3-asr-0.6b-8bit" \
  --output /tmp/ulpaso-podcast-benchmark/results.json \
  --korean-spacing-fix \
  --sanitize-scripts \
  --offline-final \
  --offline-window-seconds 20 \
  --rolling-refine-seconds 20
```

CER는 공백·문장부호를 제외한 문자 오류율이고 WER는 한국어 어절 또는 영어 단어 오류율이다. 자동 생성 YouTube 자막 자체에도 오류가 있으므로 수동 자막 결과와 분리해 해석한다.

## 전체 영상 검증

`full_video_samples.json`의 수동 한국어 자막 영상은 53분 전체를 20초 고정밀 창으로 전사한다. `full_video_latest_results.json`에는 전사 원문 없이 기준선, 개선 결과, production worker 전체 재생 결과만 기록한다. `continuousWer`는 인접 창을 연결해 20초 경계에서 생기는 자막 정렬 오차를 제거한 값이다.

```sh
src-tauri/target/debug/resources/asr-runtime/bin/python3 \
  scripts/full_video_asr_benchmark.py \
  --audio /tmp/ulpaso-full-video-benchmark/bNHlTKsCkI8.wav \
  --subtitle /tmp/ulpaso-full-video-benchmark/bNHlTKsCkI8.ko.json3 \
  --model "$HOME/Library/Application Support/app.ulpaso.editor/Models/qwen3-asr-0.6b-8bit" \
  --diar-model "$HOME/Library/Application Support/app.ulpaso.editor/Models/sortformer-v2.1-fp16" \
  --output /tmp/ulpaso-full-video-benchmark/improved-20s.json
```

실제 worker 프로토콜과 30분 이상 장시간 최종화는 다음 명령으로 같은 WAV 전체를 재생해 검증한다.

```sh
src-tauri/target/debug/resources/asr-runtime/bin/python3 \
  scripts/replay_meeting_worker.py \
  --python src-tauri/target/debug/resources/asr-runtime/bin/python3 \
  --worker src-tauri/resources/asr/asr_worker.py \
  --model-dir "$HOME/Library/Application Support/app.ulpaso.editor/Models" \
  --audio /tmp/ulpaso-full-video-benchmark/bNHlTKsCkI8.wav \
  --output /tmp/ulpaso-full-video-benchmark/worker-final.json
```
