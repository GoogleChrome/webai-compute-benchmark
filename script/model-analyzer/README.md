# Model Analyzer Scripts

These scripts help analyze the structure and features of ONNX and TFLite models used in this benchmark.

## Setup

To avoid installing Python packages globally, you can use a virtual environment. We provide a setup script to automate this:

```bash
./script/model-analyzer/setup.sh
```

This script will:
1. Create a local virtual environment in `script/model-analyzer/venv/`.
2. Install the necessary dependencies (`onnx`, `tensorflow`) into that environment.

## Running the Scripts

After setup, you can run the scripts using the virtual environment's Python interpreter. The usage is identical for both `analyze_onnx.py` and `analyze_tf.py`.

Replace `<script>` with `analyze_onnx.py` or `analyze_tf.py`, and `<path>` with a model file or a directory.

```bash
# Analyze a directory
./script/model-analyzer/venv/bin/python ./script/model-analyzer/<script> <path>

# Analyze and show all operations (instead of just top 15)
./script/model-analyzer/venv/bin/python ./script/model-analyzer/<script> <path> --all-ops
```

### Examples

**Analyze all ONNX models:**
```bash
./script/model-analyzer/venv/bin/python ./script/model-analyzer/analyze_onnx.py ./resources/transformers-js/models
```

**Analyze all TFLite models with full operation breakdown:**
```bash
./script/model-analyzer/venv/bin/python ./script/model-analyzer/analyze_tf.py ./resources/litert-js/models --all-ops
```

Alternatively, you can activate the virtual environment in your shell:

```bash
source script/model-analyzer/venv/bin/activate
python script/model-analyzer/analyze_onnx.py ./resources/transformers-js/models
# When done:
deactivate
```
