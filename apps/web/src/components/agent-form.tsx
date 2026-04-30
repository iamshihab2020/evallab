"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import { Textarea } from "@/components/ui/textarea";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  system_prompt: z.string().min(1, "System prompt is required"),
  model: z.string().min(1),
  temperature: z.number().min(0).max(2),
  max_tokens: z.coerce.number().int().min(1).max(8192),
});

export type AgentFormValues = z.infer<typeof schema>;

const MODEL_OPTIONS = ["llama-3.3-70b-versatile"];

export function AgentForm({
  defaultValues,
  onSubmit,
  submitLabel = "Save",
  isSubmitting = false,
  onCancel,
}: {
  defaultValues?: Partial<AgentFormValues>;
  onSubmit: (values: AgentFormValues) => void;
  submitLabel?: string;
  isSubmitting?: boolean;
  onCancel?: () => void;
}) {
  const {
    register,
    control,
    handleSubmit,
    formState: { errors },
  } = useForm<AgentFormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      name: "",
      system_prompt: "",
      model: "llama-3.3-70b-versatile",
      temperature: 0.7,
      max_tokens: 512,
      ...defaultValues,
    },
  });

  return (
    <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input id="name" placeholder="Support Agent v1" {...register("name")} />
        {errors.name && (
          <p className="text-sm text-destructive">{errors.name.message}</p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="system_prompt">System prompt</Label>
        <Textarea
          id="system_prompt"
          rows={8}
          placeholder="You are a customer support agent for an e-commerce store…"
          {...register("system_prompt")}
        />
        {errors.system_prompt && (
          <p className="text-sm text-destructive">
            {errors.system_prompt.message}
          </p>
        )}
      </div>

      <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="model">Model</Label>
          <select
            id="model"
            className="border-input bg-background flex h-9 w-full rounded-md border px-3 py-1 text-sm shadow-xs"
            {...register("model")}
          >
            {MODEL_OPTIONS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="max_tokens">Max tokens</Label>
          <Input
            id="max_tokens"
            type="number"
            min={1}
            max={8192}
            {...register("max_tokens")}
          />
          {errors.max_tokens && (
            <p className="text-sm text-destructive">{errors.max_tokens.message}</p>
          )}
        </div>
      </div>

      <Controller
        control={control}
        name="temperature"
        render={({ field }) => (
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <Label>Temperature</Label>
              <span className="text-sm tabular-nums text-muted-foreground">
                {field.value.toFixed(1)}
              </span>
            </div>
            <Slider
              value={[field.value]}
              min={0}
              max={2}
              step={0.1}
              onValueChange={(v) => field.onChange(v[0])}
            />
            <p className="text-xs text-muted-foreground">
              Lower = more deterministic. The judge runs at 0.0; agents typically 0.5–0.9.
            </p>
          </div>
        )}
      />

      <div className="flex gap-2 pt-2">
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? "Saving…" : submitLabel}
        </Button>
        {onCancel && (
          <Button type="button" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}
