#!/bin/bash
# setup.sh - Initialize a local virtual environment for model-analyzer scripts

# Exit on error
set -e

# Get the directory of this script
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

echo "Creating virtual environment in $DIR/venv..."
python3 -m venv venv

echo "Activating virtual environment..."
source venv/bin/activate

echo "Installing dependencies from requirements.txt..."
pip install --upgrade pip
pip install -r requirements.txt

echo ""
echo "Setup complete! To run the scripts, use the following command:"
echo "  source script/model-analyzer/venv/bin/activate"
echo "  python script/model-analyzer/analyze_onnx.py"
echo ""
echo "Or run them directly using the venv python:"
echo "  ./script/model-analyzer/venv/bin/python ./script/model-analyzer/analyze_onnx.py"
