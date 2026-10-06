import { useServerFn } from "@tanstack/react-start";
import { useEffect, useRef, useState } from "react";
import { Check, ImagePlus, Plus, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { AI_AUTO_APPLY_KEY, readLocalFlag, useLocalFlag } from "@/lib/use-local-flag";
import {
  Conversation,
  ConversationContent,
  ConversationEmptyState,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import {
  PromptInput,
  PromptInputBody,
  PromptInputButton,
  PromptInputFooter,
  PromptInputSubmit,
  PromptInputTextarea,
} from "@/components/ai-elements/prompt-input";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { CHAT_IMAGES_BUCKET, chatWithAi, resetAiChat, type AiProposal } from "@/lib/ai.functions";
import {
  createTask,
  deleteEverythingFrom,
  deleteRoutineSeries,
  deleteTaskById,
  localIso,
  updateRoutineFuture,
  updateTaskInstance,
} from "@/lib/planner";
import { repeatLabel } from "@/lib/routine-schedule";
import { tr } from "@/lib/i18n";

type AiMsg = {
  id?: string;
  role: "user" | "assistant";
  content: string;
  imageUrl?: string | null;
  proposal?: AiProposal | null;
};
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
      canvas.toBlob(
        (blob) => (blob ? resolve(blob) : reject(new Error(tr("Не удалось обработать фото")))),
        "image/jpeg",
        0.85,
      ),
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
  const [autoApply, setAutoApply] = useLocalFlag(AI_AUTO_APPLY_KEY);

  useEffect(() => {
    void load();
  }, []);
  async function load() {
    setLoading(true);
    type Row = {
      id: string;
      role: string;
      content: string;
      image_path?: string | null;
      proposal?: unknown;
    };
    let rows: Row[] = [];
    // Newest schema first; older columns sets are fallbacks until migrations are applied.
    for (const columns of [
      "id, role, content, image_path, proposal",
      "id, role, content, image_path",
      "id, role, content",
    ]) {
      const { data, error } = await supabase
        .from("ai_messages")
        .select(columns)
        .order("created_at", { ascending: true });
      if (!error) {
        rows = (data ?? []) as unknown as Row[];
        break;
      }
    }

    const paths = rows.map((row) => row.image_path).filter((path): path is string => !!path);
    const signed = new Map<string, string>();
    if (paths.length) {
      const { data } = await supabase.storage
        .from(CHAT_IMAGES_BUCKET)
        .createSignedUrls(paths, 60 * 60);
      for (const item of data ?? [])
        if (item.path && item.signedUrl) signed.set(item.path, item.signedUrl);
    }
    setMessages(
      rows
        .filter((row) => row.role !== "system")
        .map((row) => ({
          id: row.id,
          role: row.role as AiMsg["role"],
          content: row.content,
          imageUrl: row.image_path ? (signed.get(row.image_path) ?? null) : null,
          proposal: (row.proposal as AiProposal | null | undefined) ?? null,
        })),
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
      toast.error(error instanceof Error ? error.message : tr("Не удалось открыть фото"));
    }
  }

  async function uploadImage(blob: Blob) {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) throw new Error(tr("Нужно войти заново"));
    const path = `${auth.user.id}/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from(CHAT_IMAGES_BUCKET)
      .upload(path, blob, { contentType: "image/jpeg" });
    if (error) throw new Error(tr("Фото не загрузилось: {0}", { 0: error.message }));
    return path;
  }

  async function submit(message: { text: string }) {
    const value = message.text.trim();
    const picked = image;
    if ((!value && !picked) || sending) return;
    setText("");
    setImage(null);
    setMessages((current) => [
      ...current,
      { role: "user", content: value, imageUrl: picked?.previewUrl ?? null },
    ]);
    setSending(true);
    try {
      const imagePath = picked ? await uploadImage(picked.blob) : null;
      const result = await send({ data: { message: value, imagePath, today: localIso() } });
      const reply: AiMsg = {
        id: result.messageId ?? undefined,
        role: "assistant",
        content: result.reply,
        proposal: result.proposal ?? null,
      };
      // Auto-apply mode: no card, just do it (wiping everything still asks).
      if (reply.proposal && readLocalFlag(AI_AUTO_APPLY_KEY) && !wipesEverything(reply.proposal)) {
        try {
          await runProposal(reply.proposal);
          reply.content = tr("{0}\n\nИзменения применены.", { 0: reply.content });
          reply.proposal = null;
          if (reply.id)
            await supabase
              .from("ai_messages")
              .update({ proposal: null, content: reply.content })
              .eq("id", reply.id);
          toast.success(tr("Готово"));
        } catch (error) {
          toast.error(
            (error as { message?: string } | null)?.message || tr("Не удалось применить изменения"),
          );
        }
      }
      setMessages((current) => [...current, reply]);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : tr("Не удалось получить ответ"));
    } finally {
      setSending(false);
    }
  }

  async function clear() {
    if (!confirm(tr("Начать новый чат? История будет очищена."))) return;
    await reset();
    setMessages([]);
  }

  async function applyProposal(proposal: AiProposal, index: number) {
    setApplying(index);
    try {
      await runProposal(proposal);
      const target = messages[index];
      const content = tr("{0}\n\nИзменения применены.", { 0: target.content });
      setMessages((current) =>
        current.map((message, i) =>
          i === index ? { ...message, proposal: null, content } : message,
        ),
      );
      if (target.id)
        await supabase.from("ai_messages").update({ proposal: null, content }).eq("id", target.id);
      toast.success(proposal.kind === "delete" ? tr("Удалено") : tr("Расписание обновлено"));
    } catch (error) {
      toast.error(
        (error as { message?: string } | null)?.message || tr("Не удалось применить изменения"),
      );
    } finally {
      setApplying(null);
    }
  }

  return (
    <section
      data-ai-chat
      // Phone: full screen above the tab bar. Computer: right of the sidebar.
      // Wide screens: docked as a panel on the right, always open.
      className="fixed inset-x-0 bottom-[calc(var(--nav-h,calc(4.5rem+env(safe-area-inset-bottom)))-var(--vv-gap,0px))] top-0 z-20 mx-auto flex max-w-4xl flex-col bg-background pt-[env(safe-area-inset-top)] md:left-60 xl:left-auto xl:right-0 xl:w-[400px] xl:max-w-none xl:border-l xl:border-border"
    >
      <header className="flex h-[72px] shrink-0 items-center justify-between border-b border-border px-4">
        <div className="flex items-center gap-3">
          <span className="flex h-9 w-9 items-center justify-center rounded-full bg-foreground text-background">
            <Sparkles className="h-4 w-4" />
          </span>
          <div>
            <h2 className="text-sm font-semibold">Lumen AI</h2>
            <p className="text-[11px] text-muted-foreground">{tr("Помощник по твоему дню")}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={clear}
            aria-label={tr("Новый чат")}
            className="inline-flex h-12 w-12 items-center justify-center rounded-full bg-card"
          >
            <Plus className="h-6 w-6" />
          </button>
        </div>
      </header>

      <Conversation className="min-h-0">
        <ConversationContent className="mx-auto w-full max-w-3xl gap-5 px-4 py-6">
          {loading ? (
            <p className="py-16 text-center text-sm text-muted-foreground">
              {tr("Загружаю разговор…")}
            </p>
          ) : messages.length === 0 ? (
            <ConversationEmptyState
              icon={<Sparkles className="h-8 w-8" />}
              title={tr("Привет, я рядом")}
              description={tr("Попроси поставить задачу, составить план или перенести дело.")}
            />
          ) : (
            messages.map((message, index) => (
              <Message key={message.id ?? index} from={message.role}>
                {message.imageUrl && (
                  <img
                    src={message.imageUrl}
                    alt={tr("Фото")}
                    className={`max-h-72 max-w-[75%] rounded-2xl object-cover ${message.role === "user" ? "ml-auto" : ""}`}
                  />
                )}
                {message.content && (
                  <MessageContent
                    className={
                      message.role === "user"
                        ? "rounded-2xl bg-foreground text-background"
                        : "text-[15px] leading-relaxed"
                    }
                  >
                    <MessageResponse>{message.content}</MessageResponse>
                  </MessageContent>
                )}
                {message.proposal && (
                  <ProposalCard
                    proposal={message.proposal}
                    applying={applying === index}
                    onConfirm={() => void applyProposal(message.proposal!, index)}
                    onAlways={
                      autoApply || wipesEverything(message.proposal)
                        ? undefined
                        : () => {
                            setAutoApply(true);
                            toast.success(
                              tr("Теперь AI будет применять сразу. Выключить — в Настройках"),
                            );
                            void applyProposal(message.proposal!, index);
                          }
                    }
                    onCancel={() => {
                      setMessages((current) =>
                        current.map((item, i) =>
                          i === index ? { ...item, proposal: null } : item,
                        ),
                      );
                      if (message.id)
                        void supabase
                          .from("ai_messages")
                          .update({ proposal: null })
                          .eq("id", message.id);
                    }}
                  />
                )}
              </Message>
            ))
          )}
          {sending && (
            <Message from="assistant">
              <MessageContent className="text-muted-foreground">{tr("Думаю…")}</MessageContent>
            </Message>
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>

      <div className="shrink-0 border-t border-border bg-background px-3 py-3">
        <PromptInput onSubmit={submit} className="mx-auto max-w-3xl rounded-2xl bg-card">
          {image && (
            <div className="relative m-2 mb-0 w-fit">
              <img
                src={image.previewUrl}
                alt={tr("Выбранное фото")}
                className="h-20 w-20 rounded-xl object-cover"
              />
              <button
                type="button"
                onClick={() => {
                  URL.revokeObjectURL(image.previewUrl);
                  setImage(null);
                }}
                aria-label={tr("Убрать фото")}
                className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-foreground text-background"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}
          <PromptInputBody>
            <PromptInputTextarea
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder={tr("Напиши Lumen…")}
              className="min-h-12 text-base"
            />
          </PromptInputBody>
          <PromptInputFooter className="justify-between">
            <input
              ref={fileInput}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(event) => {
                void pickImage(event.target.files?.[0]);
                event.target.value = "";
              }}
            />
            <PromptInputButton
              onClick={() => fileInput.current?.click()}
              aria-label={tr("Добавить фото")}
              disabled={sending}
            >
              <ImagePlus />
            </PromptInputButton>
            <div className="flex items-center gap-2">
              <span className="text-[10px] text-muted-foreground">
                {tr("AI сначала предложит изменения")}
              </span>
              <PromptInputSubmit
                disabled={(!text.trim() && !image) || sending}
                status={sending ? "submitted" : "ready"}
                className="h-9 w-9 rounded-full"
              />
            </div>
          </PromptInputFooter>
        </PromptInput>
      </div>
    </section>
  );
}

function wipesEverything(proposal: AiProposal): boolean {
  if (proposal.kind === "batch") return proposal.parts.some(wipesEverything);
  return proposal.kind === "delete" && !!proposal.all;
}

async function runProposal(proposal: AiProposal): Promise<void> {
  if (proposal.kind === "batch") {
    for (const part of proposal.parts) await runProposal(part);
  } else if (proposal.kind === "delete") {
    if (proposal.all) await deleteEverythingFrom(localIso());
    else
      for (const item of proposal.items) {
        if (item.routineId) await deleteRoutineSeries(item.routineId, localIso());
        else if (item.taskId) await deleteTaskById(item.taskId);
      }
  } else if (proposal.kind === "create_task") {
    await createTask({
      title: proposal.title,
      date: proposal.date,
      time: proposal.time,
      repeatDays: proposal.repeatDays ?? [],
      subtasks: proposal.subtasks ?? [],
    });
  } else if (proposal.kind === "update_task") {
    if (proposal.routineId && proposal.allFuture)
      await updateRoutineFuture(proposal.routineId, proposal.fromDate, {
        title: proposal.title,
        time_of_day: proposal.time,
      });
    else
      await updateTaskInstance(
        { id: proposal.taskId, routine_id: proposal.routineId ?? null },
        {
          title: proposal.title,
          scheduled_for: proposal.date,
          scheduled_time: proposal.time,
        },
      );
  } else {
    for (const [i, item] of proposal.items.entries())
      await createTask({
        title: item.title,
        date: item.date || proposal.date,
        time: item.time,
        repeatDays: item.repeatDays ?? proposal.repeatDays ?? [],
        sortOrder: i,
      });
  }
}

function describeProposal(
  proposal: AiProposal,
): { title: string; details: string[]; danger?: boolean }[] {
  if (proposal.kind === "batch") return proposal.parts.flatMap(describeProposal);
  if (proposal.kind === "delete") {
    if (proposal.all)
      return [
        {
          title: tr("Удалить всё"),
          danger: true,
          details: [
            tr("Все повторы и все дела с сегодняшнего дня"),
            ...(proposal.counts
              ? [
                  tr("Повторов: {0} · дел: {1}", {
                    0: proposal.counts.routines,
                    1: proposal.counts.tasks,
                  }),
                ]
              : []),
            tr("Выполненное раньше останется в истории"),
          ],
        },
      ];
    return [
      {
        title: tr("Удалить"),
        danger: true,
        details: proposal.items.map(
          (item) =>
            `${item.time ? `${item.time} — ` : ""}${item.title}${
              item.routineId ? tr(" · все повторы") : item.date ? ` · ${item.date}` : ""
            }`,
        ),
      },
    ];
  }
  if (proposal.kind === "schedule") {
    const scheduleRepeat = proposal.repeatDays?.length ? repeatLabel(proposal.repeatDays) : null;
    return [
      {
        title: scheduleRepeat ? tr("Добавить повторяющиеся дела") : tr("Добавить расписание"),
        details: [
          scheduleRepeat
            ? tr("{0}, с {1}", { 0: scheduleRepeat, 1: proposal.date })
            : proposal.date,
          ...proposal.items.map((item) => {
            const repeat =
              !scheduleRepeat && item.repeatDays?.length
                ? ` · ${repeatLabel(item.repeatDays)}`
                : "";
            return tr("{0} — {1}{2}", { 0: item.time ?? "Без времени", 1: item.title, 2: repeat });
          }),
        ],
      },
    ];
  }
  return [
    {
      title:
        proposal.kind === "create_task"
          ? tr("Создать задачу")
          : proposal.allFuture
            ? tr("Изменить все повторы")
            : tr("Изменить задачу"),
      details: [
        tr("{0} — {1}", { 0: proposal.time ?? "Без времени", 1: proposal.title }),
        proposal.kind === "create_task" && proposal.repeatDays?.length
          ? tr("{0}, с {1}", { 0: repeatLabel(proposal.repeatDays), 1: proposal.date })
          : proposal.date,
        ...(proposal.kind === "create_task" && proposal.subtasks?.length
          ? proposal.subtasks.map((st) => `☐ ${st}`)
          : []),
      ],
    },
  ];
}

function ProposalCard({
  proposal,
  applying,
  onConfirm,
  onAlways,
  onCancel,
}: {
  proposal: AiProposal;
  applying: boolean;
  onConfirm: () => void;
  onAlways?: () => void;
  onCancel: () => void;
}) {
  const sections = describeProposal(proposal);
  return (
    <div className="w-full max-w-md border-y border-border py-4">
      <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
        {tr("Предложение")}
      </p>
      {sections.map((section, i) => (
        <div key={i} className={i ? "mt-4" : ""}>
          <h3 className={`mt-1 text-sm font-semibold ${section.danger ? "text-destructive" : ""}`}>
            {section.title}
          </h3>
          <div className="mt-2 space-y-1 text-sm">
            {section.details.map((detail, j) => (
              <p key={j}>{detail}</p>
            ))}
          </div>
        </div>
      ))}
      <div className="mt-4 flex flex-wrap gap-2">
        <Button onClick={onConfirm} disabled={applying} size="sm">
          <Check />
          {applying ? tr("Применяю…") : tr("Подтвердить")}
        </Button>
        {onAlways && (
          <Button onClick={onAlways} disabled={applying} variant="secondary" size="sm">
            {tr("Всегда применять")}
          </Button>
        )}
        <Button onClick={onCancel} variant="ghost" size="sm">
          <X />
          {tr("Отмена")}
        </Button>
      </div>
    </div>
  );
}
