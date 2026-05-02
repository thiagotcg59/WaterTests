import { NetworkData, DiagnosticIssue } from '../types/epanet';

const PRESSAO_NEGATIVA = 0;
const PRESSAO_BAIXA = 10; // mca
const PRESSAO_ALTA = 50; // mca
const VELOCIDADE_BAIXA = 0.3; // m/s
const VELOCIDADE_ALTA = 3.0; // m/s

export function runDiagnostics(data: NetworkData): DiagnosticIssue[] {
  const issues: DiagnosticIssue[] = [];

  // Pressões nos nós (apenas junctions)
  for (const n of Object.values(data.nodes)) {
    if (n.type !== 'junction') continue;
    if (typeof n.pressure === 'number') {
      if (n.pressure < PRESSAO_NEGATIVA) {
        issues.push({
          severity: 'critical',
          category: 'Pressão negativa',
          elementId: n.id,
          elementType: n.type,
          message: `Nó ${n.id} com pressão negativa`,
          value: n.pressure,
          unit: 'mca',
        });
      } else if (n.pressure < PRESSAO_BAIXA) {
        issues.push({
          severity: 'warning',
          category: 'Pressão baixa (< 10 mca)',
          elementId: n.id,
          elementType: n.type,
          message: `Nó ${n.id} abaixo da pressão mínima de 10 mca`,
          value: n.pressure,
          unit: 'mca',
        });
      } else if (n.pressure > PRESSAO_ALTA) {
        issues.push({
          severity: 'warning',
          category: 'Pressão alta (> 50 mca)',
          elementId: n.id,
          elementType: n.type,
          message: `Nó ${n.id} acima da pressão máxima recomendada de 50 mca`,
          value: n.pressure,
          unit: 'mca',
        });
      }
    }

    // Dados ausentes em junctions
    if (n.elevation === undefined || Number.isNaN(n.elevation)) {
      issues.push({
        severity: 'info',
        category: 'Dados ausentes',
        elementId: n.id,
        elementType: n.type,
        message: `Nó ${n.id} sem elevação informada`,
      });
    }
  }

  // Tubulações
  for (const l of Object.values(data.links)) {
    if (l.type === 'pipe') {
      if (typeof l.velocity === 'number') {
        const v = Math.abs(l.velocity);
        if (v === 0) {
          issues.push({
            severity: 'warning',
            category: 'Trecho sem vazão',
            elementId: l.id,
            elementType: l.type,
            message: `Tubo ${l.id} com velocidade nula`,
            value: 0,
            unit: 'm/s',
          });
        } else if (v < VELOCIDADE_BAIXA) {
          issues.push({
            severity: 'info',
            category: 'Velocidade baixa (< 0,3 m/s)',
            elementId: l.id,
            elementType: l.type,
            message: `Tubo ${l.id} com velocidade insuficiente para arraste`,
            value: v,
            unit: 'm/s',
          });
        } else if (v > VELOCIDADE_ALTA) {
          issues.push({
            severity: 'warning',
            category: 'Velocidade alta (> 3,0 m/s)',
            elementId: l.id,
            elementType: l.type,
            message: `Tubo ${l.id} com velocidade excessiva (risco de transientes)`,
            value: v,
            unit: 'm/s',
          });
        }
      }

      // Dados ausentes em pipes
      if (l.length === undefined || Number.isNaN(l.length) || l.length === 0) {
        issues.push({
          severity: 'info',
          category: 'Dados ausentes',
          elementId: l.id,
          elementType: l.type,
          message: `Tubo ${l.id} sem comprimento informado`,
        });
      }
      if (l.diameter === undefined || Number.isNaN(l.diameter) || l.diameter === 0) {
        issues.push({
          severity: 'info',
          category: 'Dados ausentes',
          elementId: l.id,
          elementType: l.type,
          message: `Tubo ${l.id} sem diâmetro informado`,
        });
      }
    }
  }

  // Setores isolados — componentes conectados que não contêm reservatório/tanque
  const components = findConnectedComponents(data);
  const sources = new Set(
    Object.values(data.nodes)
      .filter(n => n.type === 'reservoir' || n.type === 'tank')
      .map(n => n.id)
  );
  for (const comp of components) {
    const hasSource = comp.some(id => sources.has(id));
    if (!hasSource && comp.length > 0) {
      issues.push({
        severity: 'critical',
        category: 'Setor isolado',
        elementId: comp[0],
        elementType: data.nodes[comp[0]]?.type || 'junction',
        message: `Componente com ${comp.length} nós sem reservatório/tanque conectado (possível setor isolado)`,
        value: comp.length,
      });
    }
  }

  return issues;
}

export function findConnectedComponents(data: NetworkData): string[][] {
  const adj: Record<string, Set<string>> = {};
  for (const id of Object.keys(data.nodes)) adj[id] = new Set();
  for (const l of Object.values(data.links)) {
    // Considera tubos abertos e pumps; valves e closed pipes não conectam para fins de isolamento
    const status = (l.resultStatus || l.status || 'Open').toString();
    if (status.toLowerCase() === 'closed') continue;
    if (adj[l.node1]) adj[l.node1].add(l.node2);
    if (adj[l.node2]) adj[l.node2].add(l.node1);
  }

  const visited = new Set<string>();
  const components: string[][] = [];

  for (const id of Object.keys(data.nodes)) {
    if (visited.has(id)) continue;
    const stack = [id];
    const comp: string[] = [];
    while (stack.length) {
      const cur = stack.pop()!;
      if (visited.has(cur)) continue;
      visited.add(cur);
      comp.push(cur);
      for (const nb of adj[cur] || []) {
        if (!visited.has(nb)) stack.push(nb);
      }
    }
    components.push(comp);
  }

  return components;
}
