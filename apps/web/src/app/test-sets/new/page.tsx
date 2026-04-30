"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import type { TestSet } from "@/lib/types";

const schema = z.object({
  name: z.string().min(1, "Name is required").max(255),
  description: z.string().optional(),
});

type FormValues = z.infer<typeof schema>;

export default function NewTestSetPage() {
  const router = useRouter();
  const queryClient = useQueryClient();

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<FormValues>({ resolver: zodResolver(schema) });

  const createMutation = useMutation({
    mutationFn: (values: FormValues) =>
      api<TestSet>("/api/v1/test-sets", {
        method: "POST",
        body: JSON.stringify({
          name: values.name,
          description: values.description || null,
        }),
      }),
    onSuccess: (ts) => {
      queryClient.invalidateQueries({ queryKey: ["test-sets"] });
      toast.success("Test set created");
      router.push(`/test-sets/${ts.id}`);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="max-w-xl space-y-6">
      <div>
        <Link
          href="/test-sets"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Test sets
        </Link>
        <h1 className="mt-2 text-2xl font-semibold tracking-tight">
          New Test Set
        </h1>
      </div>

      <form
        onSubmit={handleSubmit((v) => createMutation.mutate(v))}
        className="space-y-4"
      >
        <div className="space-y-2">
          <Label htmlFor="name">Name</Label>
          <Input id="name" placeholder="e.g. SMS Customer Support v1" {...register("name")} />
          {errors.name && (
            <p className="text-sm text-destructive">{errors.name.message}</p>
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="description">Description (optional)</Label>
          <Textarea
            id="description"
            rows={4}
            placeholder="What does this test set cover?"
            {...register("description")}
          />
        </div>

        <div className="flex gap-2">
          <Button type="submit" disabled={isSubmitting || createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create"}
          </Button>
          <Button type="button" variant="ghost" asChild>
            <Link href="/test-sets">Cancel</Link>
          </Button>
        </div>
      </form>
    </div>
  );
}
