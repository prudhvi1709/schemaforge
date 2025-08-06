# SchemaForge

A modern web application that automatically generates DBT (Data Build Tool) rules from CSV and Excel files using Large Language Models (LLMs). Upload your data files and get comprehensive schema analysis, column descriptions, and production-ready DBT configurations.

## 🚀 Features

### Core Functionality

- **Multi-format Support**: Upload CSV or Excel files with multiple sheet support
- **Intelligent Schema Generation**: Automatic schema inference from file headers and sample data
- **DBT Rules Generation**: Complete DBT models, tests, and configurations
- **Interactive UI**: Clean, responsive interface with tabbed results view
- **Export Capabilities**: Download generated schemas and rules as structured JSON files
- **Entity Relationship Diagrams**: Interactive visualization of database schemas and relationships

### Advanced Features

- **Chat Interface**: Interactive Q&A about your data and schema
- **Real-time Processing**: Live status updates during file processing
- **Privacy-aware Analysis**: Column descriptions include privacy indicators
- **Multiple LLM Providers**: Support for OpenAI, OpenRouter, Ollama, and custom APIs
- **Streaming Responses**: Real-time streaming of LLM outputs as they're generated
- **Interactive ER Diagrams**: Drag-and-drop entity relationship diagrams with GoJS

## 🏗️ Architecture

The application is built with:

- **Frontend**: Modern ES6 modules with Bootstrap 5 UI
- **File Processing**: Client-side CSV/Excel parsing with XLSX library
- **LLM Integration**: `bootstrap-llm-provider` for flexible API configuration
- **Streaming**: `asyncLLM` for real-time streaming of LLM responses
- **JSON Handling**: `partial-json` for parsing incomplete JSON during streaming
- **Modular Design**: Separated concerns across focused JavaScript modules
- **Visualization**: GoJS library for interactive entity relationship diagrams

### File Structure

```
schemaforge/
├── index.html              # Main application interface
├── js/
│   ├── main.js             # Application entry point and orchestration
│   ├── file-parser.js      # CSV/Excel file parsing logic
│   ├── llm-service.js      # LLM API integration and prompts
│   ├── ui.js               # DOM manipulation and rendering
│   └── diagram.js          # Entity relationship diagram functionality
├── data/                   # Sample data files
└── README.md               # This file
```

## 🚀 Quick Start

### Prerequisites

- Modern web browser with ES6 module support
- LLM API access (OpenAI, OpenRouter, or compatible provider)

### Setup

1. **Clone the repository**

   ```bash
   git clone <repository-url>
   cd schemaforge
   ```

2. **Open the application**

   ```bash
   # Serve locally (recommended)
   python -m http.server 8000
   # Then open http://localhost:8000

   # Or open directly in browser
   open index.html
   ```

3. **Configure LLM Provider**
   - Click "Configure LLM Provider" in the interface
   - Enter your API key and select a provider
   - Supported providers:
     - OpenAI (`https://api.openai.com/v1`)
     - OpenRouter (`https://openrouter.com/api/v1`)
     - Ollama (`http://localhost:11434/v1`)
     - Any OpenAI-compatible API

## 📋 Usage Guide

### Step 1: Upload Your Data

- Select a CSV or Excel file using the file upload section
- Files with multiple sheets are automatically detected and processed
- Supported formats: `.csv`, `.xlsx`

### Step 2: Schema Generation

- The application automatically extracts headers and sample data
- LLM analyzes the structure and generates comprehensive schema information
- View results in the "Schema Overview" tab
- **Real-time streaming**: Watch as schema information appears incrementally

### Step 3: Column Analysis

- Review detailed column descriptions in the "Column Descriptions" tab
- Privacy indicators help identify sensitive data fields
- Inferred data types and metadata are displayed

### Step 4: Visualize Entity Relationships

- Navigate to the "ER Diagram" tab to see an interactive visualization
- Tables are shown as nodes with their columns listed
- Relationships between tables are displayed as connecting links
- Drag nodes to rearrange the diagram for better visualization
- Use zoom controls to focus on specific parts of the schema
- Primary keys (PK) and foreign keys (FK) are clearly marked

### Step 5: DBT Rules

- Click "Generate DBT Rules" to create DBT configurations
- Watch as rules stream in real-time to the "DBT Rules" tab
- Includes models, tests, and data quality configurations
- Production-ready YAML and SQL code

### Step 6: Interactive Chat

- Use the chat interface to ask questions about your data
- Request modifications to the generated DBT rules
- Perform exploratory data analysis through natural language
- **Streaming responses**: See the assistant's responses appear in real-time

### Step 7: Export Results

- Download the complete analysis as a structured JSON file
- Includes schema, column descriptions, and DBT configurations

## 🔧 Technical Implementation

### LLM Integration

The application uses a two-stage LLM process:

1. **Schema Generation**: Analyzes file structure and sample data to create comprehensive schema
2. **DBT Rules Generation**: Transforms schema into production-ready DBT configurations

### Entity Relationship Diagram

The application uses GoJS to create interactive entity relationship diagrams that dynamically visualize:

- Tables as nodes with expandable column lists
- Relationships between tables as connecting links
- Primary and foreign keys with clear visual indicators
- Automatic layout with force-directed positioning

### Streaming Implementation

The application implements real-time streaming of LLM responses to provide immediate feedback during processing. This enables:

- Progressive rendering of schema information as it's generated
- Live updates to the UI during lengthy operations
- Improved user experience with visual feedback

### Supported LLM Providers

The application is designed to work with multiple LLM providers through a flexible configuration system:

- OpenAI API
- OpenRouter
- Ollama (local deployment)
- Any OpenAI-compatible API endpoint

### File Processing

- **CSV**: Native JavaScript parsing with automatic delimiter detection
- **Excel**: XLSX library for multi-sheet support
- **Error Handling**: Graceful fallbacks for malformed files

## 🎯 Use Cases

- **Data Engineers**: Generate DBT boilerplate for new data sources
- **Analytics Teams**: Quick schema documentation and data quality rules
- **Data Scientists**: Understand data structure before analysis
- **Consultants**: Rapid data assessment and documentation
- **Database Designers**: Visualize and refine database schemas

## 🛠️ Development

### Code Style

- ES6 modules with modern JavaScript features
- Functional programming approach (no classes)
- Bootstrap 5 for styling (no custom CSS)
- Modular architecture with single responsibility principle

### Linting

```bash
# Format JavaScript and Markdown
npx prettier@3.5 --print-width=120 '**/*.js' '**/*.md'

# Format HTML
npx js-beautify@1 '**/*.html' --type html --replace --indent-size 2
```

## 📝 License

MIT License - see the [LICENSE](LICENSE) file for details.

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Submit a pull request

## 📞 Support

For issues and questions:

- Check the chat interface for data-related queries
- Review the LLM provider configuration for API issues
- Ensure file formats are supported (CSV, XLSX only)
