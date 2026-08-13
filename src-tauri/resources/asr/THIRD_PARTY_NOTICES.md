# Ulpaso local transcription notices

Ulpaso downloads the following models only when the local meeting-note feature is first used. Model files remain in the app data directory and inference runs on the user's Mac.

- Qwen3-ASR-0.6B-8bit: derived from Qwen3-ASR and distributed by the `mlx-community` organization under the Apache License 2.0. Review the downloaded `README.md` and model card at <https://huggingface.co/mlx-community/Qwen3-ASR-0.6B-8bit>.
- Streaming Sortformer 4-speaker v2.1 fp16: distributed by the `mlx-community` organization under the NVIDIA Open Model License. Review the downloaded `README.md` and model card at <https://huggingface.co/mlx-community/diar_streaming_sortformer_4spk-v2.1-fp16>.
- mlx-qwen3-asr: MLX inference runtime, <https://github.com/moona3k/mlx-qwen3-asr>.
- MLX Audio: local audio inference utilities, <https://github.com/Blaizzy/mlx-audio>.
- MLX: Apple machine-learning framework, <https://github.com/ml-explore/mlx>.

The exact Python dependency versions used by this build are listed in `requirements.lock` beside this notice.

## Bundled runtime

- CPython 3.12.13 is bundled under the Python Software Foundation License. Its complete notice is preserved at `asr-runtime/lib/python3.12/LICENSE.txt` inside the app resources.
- License files installed by the pinned Python packages are preserved in their corresponding `*.dist-info/licenses/` directories inside `asr-runtime/lib/python3.12/site-packages/`.
- The runtime includes MLX and MLX Metal (MIT), NumPy and SciPy (BSD), Hugging Face Hub and Transformers (Apache-2.0), tokenizers and safetensors (Apache-2.0), tqdm (MPL-2.0 and MIT), and their pinned transitive dependencies.
- `uv` is used only while assembling the relocatable runtime and is not shipped inside the application.
