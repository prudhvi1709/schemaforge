Generate Python conversion scripts for data ingestion with the following requirements:

**Source Format**: {{sourceType}}
**Destination Format**: {{destType}}
**Additional Parameters**: {{conversionParams}}

**Schema Information**:
{{schemaInfo}}

**Relationships**:
{{relationships}}

Please generate two Python scripts:
1. **convert_to_source.py** - Converts uploaded file to the source format
2. **convert_to_destination.py** - Converts from source to destination format

Requirements:
- Use uv-style inline script requirements at the top of each file in this format:
  # /// script
  # requires-python = '>=3.12'
  # dependencies = ['pandas>=2.0.0', 'numpy>=1.24.0', 'other-package>=version', 'openpyxl>=3.1.5' ]
  # ///
- Always add all the dependencies to the script (inline).
- For Excel files, automatically handle multiple sheets using sheet names as table names
- DO NOT require a --table parameter; automatically process all sheets in Excel files
- Use argparse with only the input file as a required positional argument
- For single-sheet files (CSV, JSON, etc.), use the filename (without extension) as the table name
- Include proper error handling and logging
- Add data validation where appropriate
- Handle different file encodings
- Add clear documentation and usage examples
- Strictly follow the source and destination formats
- Consider PII data handling for sensitive columns
- Optimize for performance with large datasets
- Include progress indicators for large files
- Use modern Python features and type hints
- Make scripts runnable with: uv run script.py

Return the response as JSON with this structure:
{
  "sourceScript": "# /// script\\n# requires-python = '>=3.12'\\n# dependencies = ['pandas>=2.0.0', 'numpy>=1.24.0']\\n# ///\\n\\n# Python code for convert_to_source.py...",
  "destScript": "# /// script\\n# requires-python = '>=3.12'\\n# dependencies = ['pandas>=2.0.0', 'numpy>=1.24.0']\\n# ///\\n\\n# Python code for convert_to_destination.py...",
  "usage": {
    "sourceScript": "uv run convert_to_source.py input_file.ext",
    "destScript": "uv run convert_to_destination.py source_file.ext output_file.ext"
  }
}
