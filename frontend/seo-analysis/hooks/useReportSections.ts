import { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import type { Report, ReportSection } from '../types';

const SCHEMA = 'ahrefs_web_analysis';

/**
 * Carga el informe activo del client_id + sus 6 secciones ordenadas.
 * Se suscribe a INSERT/UPDATE de report_sections para mostrar la generación
 * incremental cuando el agente está escribiendo en vivo.
 */
export function useReportSections(clientId: string | undefined) {
  const [report, setReport] = useState<Report | null>(null);
  const [sections, setSections] = useState<ReportSection[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    let unsubs: Array<() => void> = [];

    async function load() {
      setLoading(true);
      setError(null);

      const { data: rep, error: repErr } = await supabase
        .schema(SCHEMA)
        .from('reports')
        .select('*')
        .eq('client_id', clientId)
        .order('generated_at', { ascending: false })
        .limit(1)
        .maybeSingle();
      if (cancelled) return;
      if (repErr) {
        setError(repErr.message);
        setLoading(false);
        return;
      }
      setReport((rep as Report | null) ?? null);

      if (rep) {
        const { data: secs, error: secErr } = await supabase
          .schema(SCHEMA)
          .from('report_sections')
          .select('*')
          .eq('report_id', (rep as Report).id)
          .order('section_order', { ascending: true });
        if (cancelled) return;
        if (secErr) setError(secErr.message);
        else setSections((secs as ReportSection[]) ?? []);

        const ch = supabase
          .channel(`report:${(rep as Report).id}`)
          .on(
            'postgres_changes',
            {
              event: '*',
              schema: SCHEMA,
              table: 'report_sections',
              filter: `report_id=eq.${(rep as Report).id}`,
            },
            (payload) => {
              setSections((prev) => {
                const next = payload.new as ReportSection;
                const without = prev.filter((s) => s.id !== next.id);
                return [...without, next].sort((a, b) => a.section_order - b.section_order);
              });
            },
          )
          .subscribe();
        unsubs.push(() => supabase.removeChannel(ch));
      }
      setLoading(false);
    }

    load();
    return () => {
      cancelled = true;
      unsubs.forEach((u) => u());
    };
  }, [clientId]);

  return { report, sections, loading, error };
}
