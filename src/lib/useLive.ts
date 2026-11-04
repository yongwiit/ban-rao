"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "./supabase";

/**
 * ดึงข้อมูลจากตาราง แล้วดึงใหม่อัตโนมัติเมื่อมีคนในบ้านแก้ไข (realtime)
 */
export function useLive<T>(
  table: string,
  householdId: string | undefined,
  fetcher: () => PromiseLike<{ data: T[] | null; error: { message: string } | null }>,
  deps: unknown[] = [],
) {
  const [rows, setRows] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // เก็บ fetcher ล่าสุดไว้ใน ref แล้วโหลดใหม่เมื่อ deps เปลี่ยน
  const fetcherRef = useRef(fetcher);
  useEffect(() => {
    fetcherRef.current = fetcher;
  });
  const depsKey = JSON.stringify(deps);

  const refresh = useCallback(async () => {
    const { data, error } = await fetcherRef.current();
    if (error) setError(error.message);
    else {
      setError(null);
      setRows(data ?? []);
    }
    setLoading(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [depsKey]);

  useEffect(() => {
    if (!householdId) return;
    refresh();
    const channel = supabase()
      .channel(`${table}-${householdId}-${Math.random().toString(36).slice(2)}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table, filter: `household_id=eq.${householdId}` },
        () => refresh(),
      )
      .subscribe();
    return () => {
      supabase().removeChannel(channel);
    };
  }, [table, householdId, refresh]);

  return { rows, loading, error, refresh };
}
