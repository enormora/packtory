def is_budget:
    type == "number" and . > 0 and . <= 9007199254740991 and floor == .;

def benchmark_row($results):
    .name as $name
    | .packBudgetMilliseconds as $budget
    | $results[$name] as $sample
    | if ($budget | is_budget | not) then
          error("Invalid pack budget for \($name)")
      elif $sample == "skipped" or $sample == "unmeasured" then
          {name: $name, budget: $budget, duration: "-", status: $sample}
      elif ($sample | type == "string" and test("^(0|[1-9][0-9]{0,14})$")) then
          ($sample | tonumber) as $duration
          | {
              name: $name,
              budget: $budget,
              duration: $duration,
              status: (if $duration > $budget then "over budget" else "passed" end)
            }
      else
          error("Missing or invalid pack result for \($name)")
      end;

if (map(.name) | sort) != ($results | keys) then
    error("Canary result names do not match the manifest")
else
    map(benchmark_row($results)) as $rows
    | "## Canary pack benchmarks",
      "",
      "| Canary | Duration (ms) | Budget (ms) | Result |",
      "| --- | ---: | ---: | --- |",
      ($rows[] | "| \(.name) | \(.duration) | \(.budget) | \(.status) |"),
      (if any($rows[]; .status == "over budget") then error("Canary pack budget exceeded") else empty end)
end
