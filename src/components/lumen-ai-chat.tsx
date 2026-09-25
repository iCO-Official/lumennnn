import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Plus, Settings, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { Conversation, ConversationContent, ConversationEmptyState, ConversationScrollButton } from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { PromptInput, PromptInputBody, PromptInputButton, PromptInputFooter, PromptInputSubmit, PromptInputTextarea } from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CHAT_IMAGES_BUCKET, chatWithAi, resetAiChat, type AiProposal } from "@/lib/ai.functions";
import { createTask, localIso, updateRoutineFuture, updateTaskInstance } from "@/lib/planner";

type AiMsg = { id?: string; role: "user" | "assistant"; content: string; imageUrl?: string | null; proposal?: AiProposal | null };
type PickedImage = { blob: Blob; previewUrl: string };

const MAX_IMAGE_SIDE = 1600;

// Downscale and re-encode as JPEG on the device: iPhone photos are large (and often HEIC).
async function prepareImage(file: File): Promise<Blob> {
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.src = url;
    await img.decode();
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(img.naturalWidth, img.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(img.naturalWidth * scale);
    canvas.height = Math.round(img.naturalHeight * scale);
    canvas.getContext("2d")!.drawImage(img, 0, 0, canvas.width, canvas.height);
    return await new Promise<Blob>((resolve, reject) =>
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Не удалось обработать фото"))), "image/jpeg", 0.85),
    );
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function LumenAiChat() {
  const send = useServerFn(chatWithAi);
  const reset = useServerFn(resetAiChat);
  const [messages, setMessages] = useState<AiMsg[]>([]);
  const [text, setText] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [applying, setApplying] = useState<number | null>(null);
  const [image, setImage] = useState<PickedImage | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => { void load(); }, []);
  async function load() {
    setLoading(true);
    let rows: { id: string; role: string; content: string; image_path?: string | null }[] = [];
    const withImages = await supabase.from("ai_messages").select("id, role, content, image_path").order("created_at", { ascending: true });
    if (withImages.error) {
      // Fallback until the chat-images migration is applied.
      const { data } = await supabase.from("ai_messages").select("id, role, content").order("created_at", { ascending: true });
      rows = data ?? [];
    } else rows = withImages.data ?? [];

    const paths = rows.map((row) => row.image_path).filter((path): path is string => !!path);
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data } = await supabase.storage.from(CHAT_IMAGES_BUCKET).createSignedUrls(paths, 60 * 60);
      for (const item of data ?? []) if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
    }
    setMessages(
      rows
        .filter((row) => row.role !== "system")
        .map((row) => ({ id: row.id, role: row.role as AiMsg["role"], content: row.content, imageUrl: row.image_path ? signed.get(row.image_path) ?? null : null })),
    );
    setLoading(false);
  }

  async function pickImage(file: File | undefined) {
    if (!file) return;
    try {
      const blob = await prepareImage(file);
      if (image) URL.revokeObjectURL(image.previewUrl);
      setImage({ blob, previewUrl: URL.createObjectURL(blob) });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось открыть фото");
    }
  }

  async function uploadImage(blob: Blob) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error("Нужно войти заново");
    const path = `${auth.user.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage.from(CHAT_IMAGES_BUCKET).upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw new Error(`Фото не загрузилось: ${error.message}`);
    return path;
  }

  async function submit(message: { text: string }) {
    const value = message.text.trim();
    const picked = image;
    if ((!value && !picked) || sending) return;
    setText("");
    setImage(null);
    setMessages((current) => [...current, { role: "user", content: value, imageUrl: picked?.previewUrl ?? null }]);
    setSending(true);
    try {
      const imagePath = picked ? await uploadImage(picked.blob) : null;
      const result = await send({ data: { message: value, imagePath, today: localIso() } });
      setMessages((current) => [...current, { role: "assistant", content: result.reply, proposal: result.proposal ?? null }]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Не удалось получить ответ");
    } finally { setSending(false); }
  }

  async function clear() {
    if (!confirm("Начать новый чат? История будет очищена.")) return;
    await reset();
    setMessages([]);
  }

  async function applyProposal(proposal: AiProposal, index: number) {
    setApplying(index);
    try {
      if (proposal.kind === "create_task") {
        await createTask({ title: proposal.title, date: proposal.date, time: proposal.time, repeatDays: proposal.repeatDays ?? [] });
      } else if (proposal.kind === "update_task") {
        if (proposal.routineId) await updateRoutineFuture(proposal.routineId, proposal.fromDate, { title: proposal.title, time_of_day: proposal.time });
        else await updateTaskInstance(proposal.taskId, { title: proposal.title, scheduled_for: proposal.date, scheduled_time: proposal.time });
      } else {
        for (const item of proposal.items) await createTask({ title: item.title, date: proposal.date, time: item.time, repeatDays: [] });
      }
      setMessages((current) => current.map((message, i) => i === index ? { ...message, proposal: null, content: `${message.content}\n\nИзменения применены.` } : message));
      toast.success("Расписание обновлено");
    } catch (error) { toast.error(error instanceof Error ? error.message : "Не удалось применить изменения"); }
    finally { setApplying(null); }
  }

  return (
    <section className="fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] top-0 z-20 mx-auto flex max-w-4xl flex-col bg-background pt-[env(safe-area-inset-top)]">
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3"><span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background"><Sparkles className="h-4 w-4" /></span><div><h2 className="text-sm font-semibold">Lumen AI</h2><p className="text-[11px] text-muted-foreground">Помощник по твоему дню</p></div></div>
        <div className="flex gap-1"><Button variant="ghost" size="icon" onClick={clear} aria-label="Новый чат"><Plus /></Button><Button asChild variant="ghost" size="icon"><Link to="/app/settings" aria-label="Настройки"><Settings /></Link></Button></div>
      </header>

      <Conversation className="min-h-0">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-4 py-6">
          {loading ? <p className="py-16 text-center text-sm text-muted-foreground">Загружаю разговор…</p> : messages.length === 0 ? <ConversationEmptyState icon={<Sparkles className="h-8 w-8" />} title="Привет, я рядом" description="Попроси поставить задачу, составить план или перенести дело." /> : messages.map((message, index) => (
            <Message key={message.id ?? index} from={message.role}>
              {message.imageUrl && <img src={message.imageUrl} alt="Фото" className={`max-h-72 max-w-[75%] rounded-2xl object-cover ${message.role === "user" ? "ml-auto" : ""}`} />}
              {message.content && <MessageContent className={message.role === "user" ? "rounded-2xl bg-foreground text-background" : "text-[15px] leading-relaxed"}><MessageResponse>{message.content}</MessageResponse></MessageContent>}
              {message.proposal && <ProposalCard proposal={message.proposal} applying={applying === index} onConfirm={() => void applyProposal(message.proposal!, index)} onCancel={() => setMessages((current) => current.map((item, i) => i === index ? { ...item, proposal: null } : item))} />}
            </Message>
          ))}
          {sending && <Message from="assistant"><MessageContent className="text-muted-foreground">Думаю…</MessageContent></Message>}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t border-border bg-background px-3 py-3">
        <PromptInput onSubmit={submit} className="mx-auto max-w-3xl rounded-2xl bg-card">
          {image && (
            <div className="relative m-2 mb-0 w-fit">
              <img src={image.previewUrl} alt="Выбранное фото" className="h-20 w-20 rounded-xl object-cover" />
              <button type="button" onClick={() => { URL.revokeObjectURL(image.previewUrl); setImage(null); }} aria-label="Убрать фото" className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background"><X className="h-3.5 w-3.5" /></button>
            </div>
          )}
          <PromptInputBody><PromptInputTextarea value={text} onChange={(event) => setText(event.target.value)} placeholder="Напиши Lumen…" className="min-h-12 text-base" /></PromptInputBody>
          <PromptInputFooter className="justify-between">
            <input ref={fileInput} type="file" accept="image/*" className="hidden" onChange={(event) => { void pickImage(event.target.files?.[0]); event.target.value = ""; }} />
            <PromptInputButton onClick={() => fileInput.current?.click()} aria-label="Добавить фото" disabled={sending}><ImagePlus /></PromptInputButton>
            <div className="flex items-center gap-2"><span className="text-[10px] text-muted-foreground">AI сначала предложит изменения</span><PromptInputSubmit disabled={(!text.trim() && !image) || sending} status={sending ? "submitted" : "ready"} className="h-9 w-9 rounded-full" /></div>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}

function ProposalCard({ proposal, applying, onConfirm, onCancel }: { proposal: AiProposal; applying: boolean; onConfirm: () => void; onCancel: () => void }) {
  const title = proposal.kind === "create_task" ? "Создать задачу" : proposal.kind === "update_task" ? "Изменить задачу" : "Добавить расписание";
  const details = proposal.kind === "schedule" ? proposal.items.map((item) => `${item.time ?? "Без времени"} — ${item.title}`) : [`${proposal.time ?? "Без времени"} — ${proposal.title}`, proposal.date];
  return <div className="w-full max-w-md border-y border-border py-4"><p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">Предложение</p><h3 className="mt-1 text-sm font-semibold">{title}</h3><div className="mt-3 space-y-1 text-sm">{details.map((detail) => <p key={detail}>{detail}</p>)}</div><div className="mt-4 flex gap-2"><Button onClick={onConfirm} disabled={applying} size="sm"><Check />{applying ? "Применяю…" : "Подтвердить"}</Button><Button onClick={onCancel} variant="ghost" size="sm"><X />Отмена</Button></div></div>;
}