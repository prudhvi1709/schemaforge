import { html, render } from 'lit-html';

/**
 * Render entity relationship diagram using GoJS
 * @param {Object} schemaData - Schema data containing tables and relationships
 */
export function renderEntityRelationshipDiagram(schemaData) {
  const diagramContent = document.getElementById("diagram-content");
  
  if (!diagramContent) {
    console.warn("Diagram content element not found");
    return;
  }
  
  if (!schemaData?.schemas?.length) {
    render(html`<div class="alert alert-info">Loading schema data for diagram...</div>`, diagramContent);
    return;
  }
  
  // Check if we already have a diagram div to prevent duplicate initialization
  let existingDiagramDiv = document.getElementById("myDiagramDiv");
  
  // Only create the diagram template if it doesn't exist yet
  if (!existingDiagramDiv) {
    // Prepare the diagram template
    const diagramTemplate = html`
      <div id="myDiagramDiv" style="border: 1px solid #d3d3d3; width: 100%; height: 600px; position: relative;"></div>
      <div class="mt-3">
        <button id="zoomToFit" class="btn btn-sm btn-outline-secondary">Zoom to Fit</button>
        <button id="centerRoot" class="btn btn-sm btn-outline-secondary ms-2">Center on Root</button>
      </div>
    `;
    
    // Render the template first
    render(diagramTemplate, diagramContent);
    
    // Initialize the diagram after rendering
    setTimeout(() => {
      initEntityRelationshipDiagram(schemaData);
    }, 0);
  } else {
    // If diagram already exists, just update the data
    updateEntityRelationshipDiagram(schemaData);
  }
}

/**
 * Initialize GoJS entity relationship diagram
 * @param {Object} schemaData - Schema data containing tables and relationships
 */
function initEntityRelationshipDiagram(schemaData) {
  // Check if GoJS is loaded
  if (!window.go) {
    console.error("GoJS library not loaded");
    const diagramDiv = document.getElementById("myDiagramDiv");
    if (diagramDiv) {
      diagramDiv.innerHTML = '<div class="alert alert-danger">GoJS library not loaded. Please include the GoJS script in your HTML.</div>';
    }
    return;
  }
  
  // Check if diagram already exists (might happen during streaming updates)
  if (window.myDiagram) {
    updateEntityRelationshipDiagram(schemaData);
    return;
  }
  
  const $ = window.go.GraphObject.make;
  
  // Create the diagram
  window.myDiagram = $(go.Diagram, "myDiagramDiv", {
    initialContentAlignment: go.Spot.Center,
    "undoManager.isEnabled": true,
    layout: $(go.ForceDirectedLayout, {
      defaultSpringLength: 100,
      defaultElectricalCharge: 100
    })
  });
  
  // Define the node template for tables
  window.myDiagram.nodeTemplate =
    $(go.Node, "Auto", 
      {
        locationSpot: go.Spot.Center,
        fromSpot: go.Spot.AllSides,
        toSpot: go.Spot.AllSides
      },
      $(go.Shape, "Rectangle", {
        fill: "white", stroke: "#00A9C9", strokeWidth: 2
      }),
      $(go.Panel, "Table",
        { margin: 8, stretch: go.GraphObject.Fill },
        $(go.RowColumnDefinition, { row: 0, sizing: go.RowColumnDefinition.None }),
        
        // The table header
        $(go.TextBlock, 
          {
            row: 0, alignment: go.Spot.Center,
            margin: new go.Margin(0, 14, 0, 2),
            font: "bold 16px sans-serif"
          },
          new go.Binding("text", "name")),
        
        // The list of columns
        $(go.Panel, "Vertical",
          { 
            row: 1,
            padding: 3,
            alignment: go.Spot.TopLeft,
            defaultAlignment: go.Spot.Left,
            stretch: go.GraphObject.Fill,
            itemTemplate:
              $(go.Panel, "Horizontal",
                { stretch: go.GraphObject.Fill, margin: 2 },
                $(go.TextBlock,
                  { 
                    stroke: "#333333",
                    font: "12px sans-serif"
                  },
                  new go.Binding("text", "name")),
                $(go.TextBlock,
                  { 
                    stroke: "#777777",
                    font: "12px sans-serif",
                    margin: new go.Margin(0, 0, 0, 5)
                  },
                  new go.Binding("text", "info"))
              )
          },
          new go.Binding("itemArray", "items"))
      )
    );
  
  // Define the link template for relationships
  window.myDiagram.linkTemplate =
    $(go.Link,
      { 
        routing: go.Link.AvoidsNodes,
        curve: go.Link.JumpOver,
        corner: 5,
        toShortLength: 4,
        relinkableFrom: true,
        relinkableTo: true,
        reshapable: true,
        resegmentable: true
      },
      $(go.Shape, { strokeWidth: 1.5 }),
      $(go.Shape, { toArrow: "Standard", stroke: null }),
      $(go.Panel, "Auto",
        $(go.Shape, "RoundedRectangle", { fill: "white", stroke: "#00A9C9" }),
        $(go.TextBlock, { margin: 5 },
          new go.Binding("text", "text"))
      )
    );
  
  // Create the model with data
  updateDiagramModel(schemaData);
  
  // Add button event handlers
  document.getElementById("zoomToFit")?.addEventListener("click", () => {
    window.myDiagram.commandHandler.zoomToFit();
  });
  
  document.getElementById("centerRoot")?.addEventListener("click", () => {
    window.myDiagram.scale = 1.0;
    const nodeDataArray = window.myDiagram.model.nodeDataArray;
    if (nodeDataArray.length > 0) {
      window.myDiagram.scrollToRect(window.myDiagram.findNodeForKey(nodeDataArray[0].key).actualBounds);
    }
  });
}

/**
 * Update the existing diagram with new schema data
 * @param {Object} schemaData - Updated schema data
 */
function updateEntityRelationshipDiagram(schemaData) {
  if (!window.myDiagram) {
    // If diagram doesn't exist yet, initialize it
    initEntityRelationshipDiagram(schemaData);
    return;
  }
  
  // Just update the model data
  updateDiagramModel(schemaData);
}

/**
 * Update the diagram model with new schema data
 * @param {Object} schemaData - Schema data to use for the model
 */
function updateDiagramModel(schemaData) {
  if (!window.myDiagram || !schemaData?.schemas) return;
  
  // Convert schema data to GoJS model
  const nodeDataArray = [];
  const linkDataArray = [];
  
  // Create nodes for each table
  schemaData.schemas.forEach(schema => {
    const items = schema.columns?.map(col => {
      let info = col.dataType || "";
      if (col.isPrimaryKey) info += " (PK)";
      if (col.isForeignKey) info += " (FK)";
      return { name: col.name, info: info };
    }) || [];
    
    nodeDataArray.push({
      key: schema.tableName,
      name: schema.tableName,
      items: items
    });
    
    // Generate implicit relationships from column foreign key references
    if (schema.columns) {
      schema.columns.forEach(col => {
        if (col.isForeignKey && col.foreignKeyReference) {
          const ref = col.foreignKeyReference;
          if (ref.referencedTable && ref.referencedColumn) {
            linkDataArray.push({
              from: schema.tableName,
              to: ref.referencedTable,
              text: `FK: ${col.name} → ${ref.referencedColumn}`
            });
          }
        }
      });
    }
  });
  
  // Add explicit relationships if they exist
  if (schemaData.relationships && Array.isArray(schemaData.relationships) && schemaData.relationships.length > 0) {
    schemaData.relationships.forEach(rel => {
      if (rel.fromTable && rel.toTable) {
        linkDataArray.push({
          from: rel.fromTable,
          to: rel.toTable,
          text: `${rel.relationshipType || 'Relationship'}: ${rel.fromColumn || ''} → ${rel.toColumn || ''}`
        });
      }
    });
  }
  
  // If no relationships were found, generate default ones based on table names
  if (linkDataArray.length === 0 && nodeDataArray.length > 1) {
    console.warn("No relationships found in schema data. Generating default relationships based on naming patterns.");
    
    // Try to infer relationships from table names
    for (let i = 0; i < nodeDataArray.length; i++) {
      for (let j = 0; j < nodeDataArray.length; j++) {
        if (i !== j) {
          const table1 = nodeDataArray[i].name;
          const table2 = nodeDataArray[j].name;
          
          // Check if one table name is contained within another (potential relationship)
          if (table1.toLowerCase().includes(table2.toLowerCase()) || 
              table2.toLowerCase().includes(table1.toLowerCase())) {
            linkDataArray.push({
              from: table1,
              to: table2,
              text: "Inferred relationship"
            });
          }
        }
      }
    }
    
    // If still no relationships, add at least one default relationship
    if (linkDataArray.length === 0 && nodeDataArray.length >= 2) {
      linkDataArray.push({
        from: nodeDataArray[0].key,
        to: nodeDataArray[1].key,
        text: "Default relationship"
      });
    }
  }
  
  // Create the model
  window.myDiagram.model = new go.GraphLinksModel(nodeDataArray, linkDataArray);
} 