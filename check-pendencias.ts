// Supabase Edge Function: check-pendencias
// Roda a cada 15 min (via pg_cron) e envia notificações push de itens pendentes.
//
// Segredos necessários (supabase secrets set NOME=valor):
//   VAPID_PUBLIC_KEY
//   VAPID_PRIVATE_KEY
// SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY já são injetados automaticamente
// pela plataforma em toda Edge Function.

import webpush from "npm:web-push@3.6.7";
import { createClient } from "npm:@supabase/supabase-js@2";

Deno.serve(async (_req) => {
  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const VAPID_PUBLIC = Deno.env.get("VAPID_PUBLIC_KEY")!;
  const VAPID_PRIVATE = Deno.env.get("VAPID_PRIVATE_KEY")!;

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);
  webpush.setVapidDetails("mailto:contato@example.com", VAPID_PUBLIC, VAPID_PRIVATE);

  // Horário de Brasília (sem horário de verão desde 2019): UTC-3
  const now = new Date();
  const brNow = new Date(now.getTime() - 3 * 60 * 60 * 1000);
  const brToday = brNow.toISOString().slice(0, 10);
  const brHour = brNow.getUTCHours();
  const HORA_LIMITE_HABITOS_ROTINAS = 20; // depois desse horário, hábito/rotina não feito conta como pendente

  const { data: rooms, error: roomsErr } = await supabase.from("app_state").select("id, data");
  if (roomsErr) {
    console.error(roomsErr);
    return new Response(JSON.stringify({ error: roomsErr.message }), { status: 500 });
  }

  for (const row of rooms ?? []) {
    const room = row.id as string;
    const appData = (row.data ?? {}) as any;
    const pendings: { key: string; title: string; body: string }[] = [];

    for (const t of appData.tasks ?? []) {
      if (t.dueDate && t.dueDate < brToday && !t.done) {
        pendings.push({ key: `task-${t.id}`, title: "Tarefa atrasada", body: t.title });
      }
    }

    if (brHour >= HORA_LIMITE_HABITOS_ROTINAS) {
      for (const h of appData.habits ?? []) {
        if (!h.completions || !h.completions[brToday]) {
          pendings.push({ key: `habit-${h.id}-${brToday}`, title: "Hábito pendente hoje", body: h.name });
        }
      }
      for (const r of appData.routines ?? []) {
        const doneToday: string[] = (r.completions && r.completions[brToday]) || [];
        if ((r.items ?? []).length > 0 && doneToday.length < r.items.length) {
          pendings.push({
            key: `routine-${r.id}-${brToday}`,
            title: "Rotina incompleta hoje",
            body: `${r.name} (${doneToday.length}/${r.items.length})`,
          });
        }
      }
    }

    if (pendings.length === 0) continue;

    const { data: already } = await supabase
      .from("notified_items")
      .select("item_key")
      .eq("room", room)
      .eq("notified_on", brToday);
    const notifiedSet = new Set((already ?? []).map((x: any) => x.item_key));
    const toNotify = pendings.filter((p) => !notifiedSet.has(p.key));
    if (toNotify.length === 0) continue;

    const { data: subs } = await supabase.from("push_subscriptions").select("*").eq("room", room);

    for (const item of toNotify) {
      for (const s of subs ?? []) {
        try {
          await webpush.sendNotification(
            s.subscription,
            JSON.stringify({ title: item.title, body: item.body, tag: item.key })
          );
        } catch (e: any) {
          console.error("falha ao enviar push", e);
          if (e?.statusCode === 410 || e?.statusCode === 404) {
            await supabase.from("push_subscriptions").delete().eq("endpoint", s.endpoint);
          }
        }
      }
      await supabase.from("notified_items").insert({ room, item_key: item.key, notified_on: brToday });
    }
  }

  return new Response(JSON.stringify({ ok: true }), { headers: { "Content-Type": "application/json" } });
});
