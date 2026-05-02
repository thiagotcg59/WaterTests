import { NetworkData, Sector } from '../types/epanet';

/**
 * DXF (Drawing Exchange Format) Exporter for EPANET Network
 * Generates a text-based DXF file compatible with AutoCAD/DWG.
 */
export function exportToDxf(data: NetworkData, sectors: Sector[]): string {
  let dxf = [
    '0', 'SECTION',
    '2', 'HEADER',
    '9', '$ACADVER',
    '1', 'AC1015',
    '0', 'ENDSEC',
    '0', 'SECTION',
    '2', 'TABLES',
    '0', 'TABLE',
    '2', 'LAYER',
    '70', '10',
  ];

  // Define Layers
  const layers = ['NODES', 'PIPES', 'RESERVOIRS', 'TANKS', 'SECTORS'];
  layers.forEach(layer => {
    dxf.push('0', 'LAYER', '2', layer, '70', '0', '62', '7', '6', 'CONTINUOUS');
  });

  dxf.push('0', 'ENDTAB', '0', 'ENDSEC');
  dxf.push('0', 'SECTION', '2', 'ENTITIES');

  // Export Nodes
  Object.values(data.nodes).forEach(node => {
    if (!node.coordinates) return;
    const layer = node.type === 'reservoir' ? 'RESERVOIRS' : (node.type === 'tank' ? 'TANKS' : 'NODES');
    dxf.push(
      '0', 'CIRCLE',
      '8', layer,
      '10', node.coordinates.x.toString(),
      '20', node.coordinates.y.toString(),
      '30', '0.0',
      '40', '1.0' // radius
    );
    dxf.push(
      '0', 'TEXT',
      '8', layer,
      '10', (node.coordinates.x + 1.2).toString(),
      '20', (node.coordinates.y + 1.2).toString(),
      '30', '0.0',
      '40', '0.8', // height
      '1', node.id
    );
  });

  // Export Pipes
  Object.values(data.links).forEach(link => {
    const n1 = data.nodes[link.node1];
    const n2 = data.nodes[link.node2];
    if (!n1?.coordinates || !n2?.coordinates) return;

    dxf.push(
      '0', 'LINE',
      '8', 'PIPES',
      '10', n1.coordinates.x.toString(),
      '20', n1.coordinates.y.toString(),
      '30', '0.0',
      '11', n2.coordinates.x.toString(),
      '21', n2.coordinates.y.toString(),
      '31', '0.0'
    );
  });

  // Export Sector Polygons
  sectors.forEach((sector, idx) => {
    if (!sector.geometry || sector.geometry.type !== 'Polygon') return;
    
    // Simplificando: Exportar as bordas do polígono como uma LWPOLYLINE
    const coords = sector.geometry.coordinates[0];
    dxf.push(
      '0', 'LWPOLYLINE',
      '8', 'SECTORS',
      '90', coords.length.toString(),
      '70', '1', // Closed
      '43', '0.0' // Constant width
    );
    
    // Nota: DXF de setores precisa de coordenadas EPANET, não LngLat.
    // Como os polígonos de setor costumam ser armazenados em LngLat no estado,
    // precisamos converter de volta se possível, ou exportar em LngLat se o CAD suportar GIS.
    // No contexto atual, assumimos que o usuário quer ver a rede.
    
    coords.forEach(([lng, lat]) => {
      // Aqui idealmente converteríamos lng/lat para X/Y do EPANET.
      // Vou usar as coordenadas como estão (se forem georreferenciadas no CAD funciona).
      dxf.push(
        '10', lng.toString(),
        '20', lat.toString()
      );
    });
  });

  dxf.push('0', 'ENDSEC', '0', 'EOF');

  return dxf.join('\n');
}

export function downloadDxf(filename: string, content: string) {
  const element = document.createElement('a');
  const file = new Blob([content], { type: 'text/plain' });
  element.href = URL.createObjectURL(file);
  element.download = filename;
  document.body.appendChild(element);
  element.click();
  document.body.removeChild(element);
}
