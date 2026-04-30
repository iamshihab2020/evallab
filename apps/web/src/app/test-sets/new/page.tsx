"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { PageHeader } from "@/components/page-header";
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
    <div>
      <PageHeader
        eyebrow={
          <>
            <Link href="/test-sets" className="hover:text-foreground transition-colors">
              Test sets
            </Link>
            <span className="mx-1.5 opacity-40">/</span>
            <span>New</span>
          </>
        }
        title="New test set"
        blurb="Name it, describe what it covers. You'll add cases on the next screen."
      />

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <form
          onSubmit={handleSubmit((v) => createMutation.mutate(v))}
          className="lg:col-span-2 space-y-5 rounded-lg border border-border bg-card p-6 fade-up"
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
              placeholder="What does this test set cover? e.g. 'Refunds, complaints, Q&A and nonsense inputs.'"
              {...register("description")}
            />
          </div>

          <div className="flex items-center gap-2 pt-2">
            <Button
              type="submit"
              variant="primary"
              size="lg"
              loading={isSubmitting || createMutation.isPending}
            >
              Create test set
            </Button>
            <Button type="button" variant="ghost" size="lg" asChild>
              <Link href="/test-sets">Cancel</Link>
            </Button>
          </div>
        </form>

        <aside
          className="space-y-4 fade-up self-start lg:sticky lg:top-20"
          style={{ animationDelay: "120ms" }}
        >
          <div className="rounded-lg border border-border bg-card p-5 space-y-3">
            <p className="eyebrow">What's next</p>
            <ol className="text-sm text-muted-foreground space-y-2.5 leading-relaxed list-decimal list-inside">
              <li>Create the test set.</li>
              <li>
                <span className="text-foreground">Add cases</span> manually or
                upload a CSV (<span className="font-mono text-xs">input,category,expected_behavior</span>).
              </li>
              <li>
                Pick an agent on the <span className="text-foreground">Runs</span> page
                and start scoring.
              </li>
            </ol>
          </div>

          <div className="rounded-lg border border-border bg-card p-5 space-y-2">
            <p className="eyebrow">Tip</p>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Categories are optional but make per-category breakdowns possible.
              Common groupings: <span className="font-mono text-xs">refund</span>,{" "}
              <span className="font-mono text-xs">complaint</span>,{" "}
              <span className="font-mono text-xs">qa</span>.
            </p>
          </div>
        </aside>
      </div>
    </div>
  );
}
