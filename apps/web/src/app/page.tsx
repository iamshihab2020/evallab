import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { Button } from "@/components/ui/button";

const sections = [
  { title: "Test Sets", description: "Lists of inputs + expected behaviors.", count: 0 },
  { title: "Agents", description: "Prompt + model under evaluation.", count: 0 },
  { title: "Runs", description: "An agent scored against a test set.", count: 0 },
  { title: "Compare", description: "Two runs side by side.", count: 0 },
];

export default function Home() {
  return (
    <div className="space-y-12">
      <section className="space-y-3">
        <h1 className="text-3xl font-semibold tracking-tight">EvalLab</h1>
        <p className="max-w-2xl text-muted-foreground">
          Measure your LLM outputs systematically. Define test sets, define agents, run them,
          and compare runs side by side.
        </p>
      </section>

      <section className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {sections.map((s) => (
          <Card key={s.title}>
            <CardHeader>
              <CardTitle>{s.title}</CardTitle>
              <CardDescription>{s.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <p className="text-3xl font-semibold tabular-nums">{s.count}</p>
            </CardContent>
          </Card>
        ))}
      </section>

      <section>
        <Tooltip>
          <TooltipTrigger asChild>
            <span className="inline-block">
              <Button disabled>Load seed data</Button>
            </span>
          </TooltipTrigger>
          <TooltipContent>Available after Phase 2.</TooltipContent>
        </Tooltip>
      </section>
    </div>
  );
}
