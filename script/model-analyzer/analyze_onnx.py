import onnx
from collections import Counter
import utils

def analyze_model(model_path, models_dir=None, show_all_ops=False):
    display_name = utils.get_display_name(model_path, models_dir)
    print(f"=== Model: {display_name} ===")
    try:
        model = onnx.load(model_path, load_external_data=False)
        graph = model.graph

        print("Inputs:")
        for inp in graph.input:
            tensor_type = inp.type.tensor_type
            dtype = tensor_type.elem_type
            dtype_name = onnx.TensorProto.DataType.Name(dtype) if dtype else "UNKNOWN"

            shape = []
            for d in tensor_type.shape.dim:
                if d.HasField("dim_value"):
                    shape.append(str(d.dim_value))
                elif d.HasField("dim_param"):
                    shape.append(d.dim_param)
                else:
                    shape.append("?")
            print(f"  - Name: {inp.name}, Shape: [{', '.join(shape)}], Type: {dtype_name}")

        print("Outputs:")
        for out in graph.output:
            tensor_type = out.type.tensor_type
            dtype = tensor_type.elem_type
            dtype_name = onnx.TensorProto.DataType.Name(dtype) if dtype else "UNKNOWN"

            shape = []
            for d in tensor_type.shape.dim:
                if d.HasField("dim_value"):
                    shape.append(str(d.dim_value))
                elif d.HasField("dim_param"):
                    shape.append(d.dim_param)
                else:
                    shape.append("?")
            print(f"  - Name: {out.name}, Shape: [{', '.join(shape)}], Type: {dtype_name}")

        op_types = [node.op_type for node in graph.node]
        op_counts = Counter(op_types)

        print(f"Structure:")
        print(f"  - Total operations: {len(op_types)}")
        print(f"  - Unique operation types: {len(op_counts)}")

        utils.print_op_breakdown(op_counts, show_all_ops)

        has_quantization = any(op.startswith("Quantize") or "MatMulInteger" in op or "DynamicQuantize" in op or op == "MatMulNBits" for op in op_counts)
        print(f"Features:")
        print(f"  - Uses explicit quantization/integer ops: {has_quantization}")
        if "q4" in model_path.lower() or "uint8" in model_path.lower() or "bnb4" in model_path.lower():
            print(f"  - Filename implies quantization: True")

    except Exception as e:
        print(f"Error analyzing {model_path}: {e}")
    print()

def main():
    args = utils.parse_args("Analyze ONNX models.", "ONNX")
    utils.run_analysis(args, "onnx", analyze_model)

if __name__ == "__main__":
    main()
