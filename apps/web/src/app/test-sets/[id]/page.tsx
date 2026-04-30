"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { api, ApiError } from "@/lib/api";
import { formatDateTime } from "@/lib/format";
import type {
  CSVUploadResult,
  TestCase,
  TestCaseCreateInput,
  TestSetDetail,
} from "@/lib/types";

const detailKey = (id: string) => ["test-sets", id];

export default function TestSetDetailPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();

  const { data, isLoading, error } = useQuery({
    queryKey: detailKey(id),
    queryFn: () => api<TestSetDetail>(`/api/v1/test-sets/${id}`),
  });

  const deleteSet = useMutation({
    mutationFn: () =>
      api<void>(`/api/v1/test-sets/${id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["test-sets"] });
      toast.success("Test set deleted");
      router.push("/test-sets");
    },
    onError: (e) => toast.error(e.message),
  });

  if (isLoading) {
    return <p className="text-sm text-muted-foreground">Loading…</p>;
  }
  if (error || !data) {
    return (
      <p className="text-sm text-destructive">
        Failed to load test set{error ? `: ${error.message}` : ""}.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <Link
          href="/test-sets"
          className="text-sm text-muted-foreground hover:underline"
        >
          ← Test sets
        </Link>

        <div className="mt-2 flex items-start justify-between gap-4">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold tracking-tight">{data.name}</h1>
            {data.description && (
              <p className="text-muted-foreground">{data.description}</p>
            )}
            <p className="text-sm text-muted-foreground">
              {data.case_count} case{data.case_count === 1 ? "" : "s"} ·
              {" "}created {formatDateTime(data.created_at)} ·
              {" "}edited {formatDateTime(data.updated_at)}
            </p>
          </div>

          <div className="flex shrink-0 gap-2">
            <EditTestSetDialog testSet={data} />
            <DeleteTestSetDialog
              isPending={deleteSet.isPending}
              onConfirm={() => deleteSet.mutate()}
            />
          </div>
        </div>
      </div>

      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold">Cases</h2>
          <div className="flex gap-2">
            <AddCaseDialog testSetId={id} />
            <UploadCsvDialog testSetId={id} />
          </div>
        </div>

        {data.cases.length === 0 ? (
          <div className="rounded-lg border border-dashed p-8 text-center text-sm text-muted-foreground">
            No cases yet. Add one or upload a CSV.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-12">#</TableHead>
                <TableHead>Input</TableHead>
                <TableHead className="w-32">Category</TableHead>
                <TableHead>Expected behavior</TableHead>
                <TableHead className="w-28 text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.cases.map((c) => (
                <TableRow key={c.id}>
                  <TableCell className="text-muted-foreground tabular-nums">
                    {c.position}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap">
                    {c.input}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {c.category ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-md whitespace-pre-wrap text-muted-foreground">
                    {c.expected_behavior}
                  </TableCell>
                  <TableCell>
                    <div className="flex justify-end gap-2">
                      <EditCaseDialog testSetId={id} testCase={c} />
                      <DeleteCaseButton testSetId={id} testCase={c} />
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </section>
    </div>
  );
}

// --- Edit test set ---

const editTestSetSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});
type EditTestSetValues = z.infer<typeof editTestSetSchema>;

function EditTestSetDialog({ testSet }: { testSet: TestSetDetail }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<EditTestSetValues>({
    resolver: zodResolver(editTestSetSchema),
    defaultValues: {
      name: testSet.name,
      description: testSet.description ?? "",
    },
  });

  const mutation = useMutation({
    mutationFn: (values: EditTestSetValues) =>
      api(`/api/v1/test-sets/${testSet.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: values.name,
          description: values.description || null,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(testSet.id) });
      queryClient.invalidateQueries({ queryKey: ["test-sets"] });
      toast.success("Test set updated");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          reset({
            name: testSet.name,
            description: testSet.description ?? "",
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Edit</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit test set</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="edit-name">Name</Label>
            <Input id="edit-name" {...register("name")} />
            {errors.name && (
              <p className="text-sm text-destructive">{errors.name.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="edit-description">Description</Label>
            <Textarea id="edit-description" rows={3} {...register("description")} />
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Delete test set ---

function DeleteTestSetDialog({
  isPending,
  onConfirm,
}: {
  isPending: boolean;
  onConfirm: () => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="destructive">Delete</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete test set?</DialogTitle>
          <DialogDescription>
            This permanently removes the test set and all its cases. Existing runs
            that reference this test set will keep their snapshotted data.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button variant="destructive" onClick={onConfirm} disabled={isPending}>
            {isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- Add case ---

const caseSchema = z.object({
  input: z.string().min(1, "Input is required"),
  category: z.string().optional(),
  expected_behavior: z.string().min(1, "Expected behavior is required"),
});
type CaseValues = z.infer<typeof caseSchema>;

function AddCaseDialog({ testSetId }: { testSetId: string }) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CaseValues>({ resolver: zodResolver(caseSchema) });

  const mutation = useMutation({
    mutationFn: (values: CaseValues) => {
      const body: TestCaseCreateInput = {
        input: values.input,
        category: values.category || null,
        expected_behavior: values.expected_behavior,
      };
      return api<TestCase>(`/api/v1/test-sets/${testSetId}/cases`, {
        method: "POST",
        body: JSON.stringify(body),
      });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(testSetId) });
      toast.success("Case added");
      reset({ input: "", category: "", expected_behavior: "" });
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline">+ Add case</Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Add case</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor="add-input">Input</Label>
            <Textarea id="add-input" rows={3} {...register("input")} />
            {errors.input && (
              <p className="text-sm text-destructive">{errors.input.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-category">Category (optional)</Label>
            <Input
              id="add-category"
              placeholder="refund, complaint, qa, …"
              {...register("category")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="add-expected">Expected behavior</Label>
            <Textarea
              id="add-expected"
              rows={4}
              {...register("expected_behavior")}
            />
            {errors.expected_behavior && (
              <p className="text-sm text-destructive">
                {errors.expected_behavior.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Adding…" : "Add"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Edit case ---

function EditCaseDialog({
  testSetId,
  testCase,
}: {
  testSetId: string;
  testCase: TestCase;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<CaseValues>({
    resolver: zodResolver(caseSchema),
    defaultValues: {
      input: testCase.input,
      category: testCase.category ?? "",
      expected_behavior: testCase.expected_behavior,
    },
  });

  const mutation = useMutation({
    mutationFn: (values: CaseValues) =>
      api(`/api/v1/test-cases/${testCase.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          input: values.input,
          category: values.category || null,
          expected_behavior: values.expected_behavior,
        }),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(testSetId) });
      toast.success("Case updated");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (o) {
          reset({
            input: testCase.input,
            category: testCase.category ?? "",
            expected_behavior: testCase.expected_behavior,
          });
        }
      }}
    >
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm">
          Edit
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Edit case</DialogTitle>
        </DialogHeader>
        <form
          onSubmit={handleSubmit((v) => mutation.mutate(v))}
          className="space-y-4"
        >
          <div className="space-y-2">
            <Label htmlFor={`edit-input-${testCase.id}`}>Input</Label>
            <Textarea
              id={`edit-input-${testCase.id}`}
              rows={3}
              {...register("input")}
            />
            {errors.input && (
              <p className="text-sm text-destructive">{errors.input.message}</p>
            )}
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-category-${testCase.id}`}>Category</Label>
            <Input
              id={`edit-category-${testCase.id}`}
              {...register("category")}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor={`edit-expected-${testCase.id}`}>
              Expected behavior
            </Label>
            <Textarea
              id={`edit-expected-${testCase.id}`}
              rows={4}
              {...register("expected_behavior")}
            />
            {errors.expected_behavior && (
              <p className="text-sm text-destructive">
                {errors.expected_behavior.message}
              </p>
            )}
          </div>
          <DialogFooter>
            <Button type="submit" disabled={mutation.isPending}>
              {mutation.isPending ? "Saving…" : "Save"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// --- Delete case ---

function DeleteCaseButton({
  testSetId,
  testCase,
}: {
  testSetId: string;
  testCase: TestCase;
}) {
  const [open, setOpen] = useState(false);
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: () =>
      api(`/api/v1/test-cases/${testCase.id}`, { method: "DELETE" }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: detailKey(testSetId) });
      toast.success("Case deleted");
      setOpen(false);
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="ghost" size="sm" className="text-destructive">
          Delete
        </Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Delete case?</DialogTitle>
          <DialogDescription>
            This removes case #{testCase.position} from the test set.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="ghost" onClick={() => setOpen(false)}>
            Cancel
          </Button>
          <Button
            variant="destructive"
            onClick={() => mutation.mutate()}
            disabled={mutation.isPending}
          >
            {mutation.isPending ? "Deleting…" : "Delete"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// --- CSV upload ---

function UploadCsvDialog({ testSetId }: { testSetId: string }) {
  const [open, setOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const queryClient = useQueryClient();

  const mutation = useMutation({
    mutationFn: async (f: File) => {
      const fd = new FormData();
      fd.append("file", f);
      return api<CSVUploadResult>(
        `/api/v1/test-sets/${testSetId}/cases/bulk`,
        { method: "POST", body: fd },
      );
    },
    onSuccess: (result) => {
      if (result.errors.length > 0) {
        toast.error(
          `Rejected: ${result.errors.length} row error(s). Fix the file and retry.`,
        );
      } else {
        toast.success(`Added ${result.created} case(s)`);
        queryClient.invalidateQueries({ queryKey: detailKey(testSetId) });
        setOpen(false);
        setFile(null);
      }
    },
    onError: (e) => {
      const msg =
        e instanceof ApiError ? `${e.status}: ${e.body}` : e.message;
      toast.error(msg);
    },
  });

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o);
        if (!o) setFile(null);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline">Upload CSV</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Upload CSV</DialogTitle>
          <DialogDescription>
            Header row required: <code>input,category,expected_behavior</code>{" "}
            (any order). Empty <code>category</code> allowed; empty{" "}
            <code>input</code> or <code>expected_behavior</code> rejects the whole
            upload — fix the file and retry.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <Input
            type="file"
            accept=".csv,text/csv"
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
          />
          {mutation.data && mutation.data.errors.length > 0 && (
            <div className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm">
              <p className="mb-2 font-medium text-destructive">
                Row errors ({mutation.data.errors.length}):
              </p>
              <ul className="list-disc space-y-1 pl-5">
                {mutation.data.errors.map((err) => (
                  <li key={err.row}>
                    Row {err.row}: {err.message}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button
            onClick={() => file && mutation.mutate(file)}
            disabled={!file || mutation.isPending}
          >
            {mutation.isPending ? "Uploading…" : "Upload"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
