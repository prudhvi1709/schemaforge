#!/bin/bash

# DBT Local Run Script - Automated setup and execution
# This script extracts SQL and YAML from dbt_rules.md and runs dbt locally

set -e  # Exit on any error

echo "🚀 Starting DBT Local Setup and Run..."

# Check for required files
if [[ ! -f "dbt_rules.md" ]]; then
    echo "❌ Error: dbt_rules.md not found in current directory"
    exit 1
fi

# Find the dataset file (prioritize dataset-* files, then look for any data files)
DATASET_FILE=$(ls dataset-* 2>/dev/null | head -1)
if [[ -z "$DATASET_FILE" ]]; then
    # Look for common data file patterns
    DATASET_FILE=$(ls *.csv *.xlsx *.xls 2>/dev/null | head -1)
    if [[ -z "$DATASET_FILE" ]]; then
        echo "❌ Error: No dataset file found (expected dataset-* or *.csv, *.xlsx, *.xls)"
        exit 1
    fi
    echo "📁 Found data file: $DATASET_FILE (not prefixed with 'dataset-')"
else
    echo "📁 Found dataset file: $DATASET_FILE"
fi

# Create dbt project structure
echo "📂 Creating dbt project structure..."
PROJECT_NAME="my_dbt_project"
mkdir -p "$PROJECT_NAME"/{models,seeds}

# Convert dataset to CSV if it's Excel
# Remove 'dataset-' prefix if present, otherwise use the full basename without extension
if [[ "$DATASET_FILE" == dataset-* ]]; then
    DATASET_NAME=$(basename "$DATASET_FILE" | sed 's/^dataset-//' | sed 's/\.[^.]*$//')
else
    DATASET_NAME=$(basename "$DATASET_FILE" | sed 's/\.[^.]*$//')
fi
CSV_FILE="seeds/${DATASET_NAME}.csv"

if [[ "$DATASET_FILE" == *.xlsx ]] || [[ "$DATASET_FILE" == *.xls ]]; then
    echo "📊 Converting Excel to CSV..."
    # Check if Python is available
    if command -v python3 &> /dev/null; then
        python3 -c "
import pandas as pd
import sys
import os

try:
    # Read Excel file
    df = pd.read_excel('$DATASET_FILE')
    # Write to CSV
    df.to_csv('$PROJECT_NAME/$CSV_FILE', index=False)
    print('✅ Excel converted to CSV successfully')
except Exception as e:
    print(f'❌ Error converting Excel to CSV: {e}')
    sys.exit(1)
"
    else
        echo "❌ Error: Python3 with pandas is required to convert Excel files"
        echo "Please install Python3 and pandas, or manually convert $DATASET_FILE to CSV"
        exit 1
    fi
else
    # Copy CSV file directly
    cp "$DATASET_FILE" "$PROJECT_NAME/$CSV_FILE"
    echo "✅ CSV file copied to seeds/"
fi

# Extract SQL and YAML from dbt_rules.md
echo "🔍 Extracting SQL and YAML from dbt_rules.md..."

python3 - << 'EOF'
import re
import os

def extract_dbt_content(file_path):
    with open(file_path, 'r') as f:
        content = f.read()
    
    # Find all rule sections
    sections = re.split(r'^## (.+)', content, flags=re.MULTILINE)[1:]  # Skip the first empty part
    
    models_created = []
    
    for i in range(0, len(sections), 2):
        if i + 1 >= len(sections):
            break
            
        title = sections[i].strip()
        section_content = sections[i + 1]
        
        # Extract table name from title (remove materialization info)
        table_name = re.sub(r'\s*\(.*\)$', '', title).strip()
        
        # Extract SQL
        sql_matches = re.findall(r'```sql\n(.*?)\n```', section_content, re.DOTALL)
        # Extract YAML
        yaml_matches = re.findall(r'```yaml\n(.*?)\n```', section_content, re.DOTALL)
        
        if sql_matches:
            sql_content = sql_matches[0].strip()
            model_file = f"my_dbt_project/models/{table_name}.sql"
            
            with open(model_file, 'w') as f:
                f.write(sql_content)
            models_created.append(table_name)
            print(f"✅ Created SQL model: {model_file}")
        
        if yaml_matches:
            yaml_content = yaml_matches[0].strip()
            yaml_file = f"my_dbt_project/models/{table_name}.yml"
            
            with open(yaml_file, 'w') as f:
                f.write(yaml_content)
            print(f"✅ Created YAML config: {yaml_file}")
    
    return models_created

# Extract content
models = extract_dbt_content('dbt_rules.md')
print(f"📋 Created {len(models)} dbt models: {', '.join(models)}")
EOF

# Create dbt_project.yml
echo "⚙️ Creating dbt_project.yml..."
cat > "$PROJECT_NAME/dbt_project.yml" << EOL
name: "$PROJECT_NAME"
version: "1.0"
profile: "$PROJECT_NAME"

model-paths: ["models"]
seed-paths: ["seeds"]
target-path: "target"
clean-targets: ["target", "dbt_modules"]

models:
  $PROJECT_NAME:
    materialized: view
EOL

# Create profiles.yml in the project directory (for local use)
echo "📋 Creating local profiles.yml..."
cat > "$PROJECT_NAME/profiles.yml" << EOL
$PROJECT_NAME:
  target: dev
  outputs:
    dev:
      type: duckdb
      path: my_local.duckdb
EOL

# Create a simple dbt setup script inside the project
cat > "$PROJECT_NAME/setup_and_run.sh" << 'EOL'
#!/bin/bash

echo "🔧 Setting up DBT environment..."

# Use local profiles.yml
export DBT_PROFILES_DIR=$(pwd)

# Check if dbt is installed
if ! command -v dbt &> /dev/null; then
    echo "❌ Error: dbt is not installed"
    echo "Please install dbt with: pip install dbt-core dbt-duckdb"
    exit 1
fi

echo "📊 Running dbt seed (loading data)..."
dbt seed

echo "🏗️ Running dbt run (building models)..."
dbt run

echo "🧪 Running dbt test (data quality checks)..."
dbt test

echo "✅ DBT run completed!"
echo ""
echo "📋 Results:"
echo "  - Check target/run_results.json for detailed results"
echo "  - Data loaded into my_local.duckdb"
echo "  - Models created as views/tables"
echo "  - Tests run to identify data quality issues"
echo ""
echo "💡 To explore results:"
echo "  - dbt docs generate && dbt docs serve (optional)"
echo "  - Connect to my_local.duckdb with your favorite SQL client"
EOL

chmod +x "$PROJECT_NAME/setup_and_run.sh"

# Run the dbt setup
echo "🎯 Entering project directory and running dbt..."
cd "$PROJECT_NAME"
./setup_and_run.sh

echo ""
echo "🎉 DBT local run completed successfully!"
echo "📁 All files are in the '$PROJECT_NAME' directory"
echo "🗃️ Database file: $PROJECT_NAME/my_local.duckdb"
echo ""
echo "🔄 To run again: cd $PROJECT_NAME && ./setup_and_run.sh"