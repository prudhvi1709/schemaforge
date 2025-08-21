import { html, render } from 'lit-html';

export function renderEntityRelationshipDiagram(schemaData) {
  const diagramContent = document.getElementById("diagram-content");
  if (!diagramContent) return;
  
  if (!schemaData?.schemas?.length) {
    return render(html`<div class="alert alert-info">Loading diagram...</div>`, diagramContent);
  }
  
  if (!document.getElementById("myDiagramDiv")) {
    render(html`
      <div id="myDiagramDiv" style="border: 1px solid #d3d3d3; width: 100%; height: 600px;"></div>
      <div class="mt-3">
        <button id="zoomToFit" class="btn btn-sm btn-outline-secondary">Fit</button>
        <button id="centerRoot" class="btn btn-sm btn-outline-secondary ms-2">Center</button>
      </div>
    `, diagramContent);
    setTimeout(() => initDiagram(schemaData), 0);
  } else {
    updateDiagram(schemaData);
  }
}

function initDiagram(schemaData) {
  if (!window.go) {
    document.getElementById("myDiagramDiv").innerHTML = '<div class="alert alert-danger">GoJS not loaded</div>';
    return;
  }
  
  if (window.myDiagram) return updateDiagram(schemaData);
  
  const $ = window.go.GraphObject.make;
  
  window.myDiagram = $(go.Diagram, "myDiagramDiv", {
    initialContentAlignment: go.Spot.Center,
    "undoManager.isEnabled": true,
    layout: $(go.ForceDirectedLayout, { defaultSpringLength: 100, defaultElectricalCharge: 100 })
  });
  
  window.myDiagram.nodeTemplate = $(go.Node, "Auto",
    { locationSpot: go.Spot.Center, fromSpot: go.Spot.AllSides, toSpot: go.Spot.AllSides },
    $(go.Shape, "Rectangle", { fill: "white", stroke: "#00A9C9", strokeWidth: 2 }),
    $(go.Panel, "Table", { margin: 8, stretch: go.GraphObject.Fill },
      $(go.RowColumnDefinition, { row: 0, sizing: go.RowColumnDefinition.None }),
      $(go.TextBlock, { row: 0, alignment: go.Spot.Center, margin: new go.Margin(0, 14, 0, 2), font: "bold 16px sans-serif" },
        new go.Binding("text", "tableName")),
      $(go.Panel, "Vertical", { row: 1, padding: 3, alignment: go.Spot.TopLeft, defaultAlignment: go.Spot.Left, stretch: go.GraphObject.Horizontal, itemTemplate: 
        $(go.Panel, "Horizontal", { stretch: go.GraphObject.Horizontal },
          $(go.TextBlock, { font: "bold 13px sans-serif", stroke: "#C41E3A", width: 14 },
            new go.Binding("text", "isPK", val => val ? "🔑" : "")),
          $(go.TextBlock, { font: "11px sans-serif", margin: new go.Margin(0, 0, 0, 2) },
            new go.Binding("text", "", col => `${col.name}: ${col.dataType}`))
        )
      }, new go.Binding("itemArray", "columns"))
    )
  );
  
  window.myDiagram.linkTemplate = $(go.Link,
    $(go.Shape, { strokeWidth: 2, stroke: "#333" }),
    $(go.Shape, { toArrow: "Standard", stroke: "#333", fill: "#333" })
  );
  
  setupEventHandlers();
  updateDiagram(schemaData);
}

function updateDiagram(schemaData) {
  if (!window.myDiagram) return;
  
  const nodeDataArray = schemaData.schemas.map(schema => ({
    key: schema.tableName,
    tableName: schema.tableName,
    columns: (schema.columns || []).slice(0, 8).map(col => ({
      name: col.name,
      dataType: col.dataType?.length > 10 ? col.dataType.substring(0, 10) + "..." : col.dataType,
      isPK: col.isPrimaryKey
    }))
  }));
  
  const linkDataArray = (schemaData.relationships || []).map(rel => ({
    from: rel.fromTable,
    to: rel.toTable,
    text: `${rel.fromColumn} → ${rel.toColumn}`
  }));
  
  window.myDiagram.model = new go.GraphLinksModel(nodeDataArray, linkDataArray);
}

function setupEventHandlers() {
  document.getElementById("zoomToFit")?.addEventListener("click", () => {
    window.myDiagram?.zoomToFit();
  });
  
  document.getElementById("centerRoot")?.addEventListener("click", () => {
    const firstNode = window.myDiagram?.findNodeForKey(window.myDiagram.model.nodeDataArray[0]?.key);
    if (firstNode) {
      window.myDiagram.scale = 1;
      window.myDiagram.centerRect(firstNode.actualBounds);
    }
  });
}