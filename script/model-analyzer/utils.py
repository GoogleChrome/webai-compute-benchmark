import os
import glob
import sys
import argparse

def get_display_name(model_path, models_dir):
    if models_dir:
        return os.path.relpath(model_path, models_dir)
    return model_path

def print_op_breakdown(op_counts, show_all_ops):
    unique_ops = len(op_counts)
    if show_all_ops:
        print(f"  - All operations breakdown:")
        for op_name, count in op_counts.most_common():
            print(f"    - {op_name}: {count}")
    else:
        print(f"  - Operations breakdown (top 15):")
        for op_name, count in op_counts.most_common(15):
            print(f"    - {op_name}: {count}")
        if unique_ops > 15:
            print(f"    - ... and {unique_ops - 15} more types")

def parse_args(description, model_extension):
    parser = argparse.ArgumentParser(description=description)
    parser.add_argument("path", help=f"Path to a {model_extension} model file or a directory containing them.")
    parser.add_argument("--all-ops", action="store_true", help="Show all operation types instead of just the top 15.")
    return parser.parse_args()

def get_target_path(path):
    target_path = os.path.abspath(path)
    if not os.path.exists(target_path):
        print(f"Error: Path '{path}' does not exist.")
        sys.exit(1)
    return target_path

def run_analysis(args, extension, analyze_func):
    target_path = get_target_path(args.path)

    if os.path.isfile(target_path):
        analyze_func(target_path, show_all_ops=args.all_ops)
    elif os.path.isdir(target_path):
        models = glob.glob(os.path.join(target_path, "**", f"*.{extension}"), recursive=True)
        print(f"Found {len(models)} models in {target_path}.\n")
        for model_path in models:
            analyze_func(model_path, target_path, show_all_ops=args.all_ops)
    else:
        print(f"Error: '{args.path}' is not a file or directory.")
        sys.exit(1)
