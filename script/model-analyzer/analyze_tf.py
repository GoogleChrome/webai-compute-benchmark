import tensorflow as tf
from collections import Counter
import utils

def analyze_model(model_path, models_dir=None, show_all_ops=False):
    display_name = utils.get_display_name(model_path, models_dir)
    print(f"=== Model: {display_name} ===")
    try:
        # Load the model and allocate tensors.
        interpreter = tf.lite.Interpreter(model_path=model_path)
        interpreter.allocate_tensors()

        # Get input and output tensors.
        input_details = interpreter.get_input_details()
        output_details = interpreter.get_output_details()

        print("Inputs:")
        for inp in input_details:
            print(f"  - Name: {inp['name']}, Shape: {inp['shape']}, Type: {inp['dtype'].__name__}")

        print("Outputs:")
        for out in output_details:
            print(f"  - Name: {out['name']}, Shape: {out['shape']}, Type: {out['dtype'].__name__}")

        ops = interpreter._get_ops_details()
        op_names = [op['op_name'] for op in ops]
        op_counts = Counter(op_names)

        print(f"Structure:")
        print(f"  - Total operations: {len(ops)}")
        print(f"  - Unique operation types: {len(op_counts)}")

        utils.print_op_breakdown(op_counts, show_all_ops)

        # Check for dynamic tensors, quantization features
        tensor_details = interpreter.get_tensor_details()
        is_quantized = any(t['quantization'] != (0.0, 0) for t in tensor_details)
        has_dynamic = any(len(t['shape']) == 0 for t in tensor_details)
        print(f"Features:")
        print(f"  - Has quantization params: {is_quantized}")

    except Exception as e:
        print(f"Error analyzing {model_path}: {e}")
    print()

def main():
    args = utils.parse_args("Analyze TFLite models.", "TFLite")
    utils.run_analysis(args, "tflite", analyze_model)

if __name__ == "__main__":
    main()
