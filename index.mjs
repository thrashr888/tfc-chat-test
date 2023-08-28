import { LLM } from 'llama-node';
import { LLamaCpp } from 'llama-node/dist/llm/llama-cpp.js';
import path from 'path';
import fs from 'fs';
import ora from 'ora';
import Papa from 'papaparse';
import _ from 'lodash';

const model = path.resolve(process.cwd(), 'llama.cpp/models/llama-2-13b-chat.ggmlv3.q4_0.bin');

const llama = new LLM(LLamaCpp);
const config = {
  modelPath: model,
  enableLogging: false,
  nCtx: 2048,
  seed: 0,
  f16Kv: false,
  logitsAll: false,
  vocabOnly: false,
  useMlock: false,
  embedding: false,
  useMmap: true,
  nGpuLayers: 0,
};

const run = async (question) => {
  await llama.load(config);
  console.log('Question:', question);

  const userCsvContent = fs.readFileSync('user.csv', 'utf-8');

  const contextData = query(question);
  const filters = await completion(contextData, false, 'Querying data...');

  console.log('Filters used in search:', extractAndParseJSON(filters), '\n');
  const result = await readAndFilterCSV(userCsvContent, extractAndParseJSON(filters));
  const csvString = Papa.unparse(result);

  console.log('Data used in query:', csvString, '\n');
  const prompt = ask(question, csvString);

  await completion(prompt, true, 'Answering question...');
};

function query(question) {
  const prompt = `SYSTEM: Based on the context's CSV headers and data type, return a JSON object of the best columns and filters to answer the question.
CONTEXT SCHEMA:
all_checks_succeeded: bool
checks_errored: int
checks_failed: int
checks_passed: int
checks_unknown: int
current_run_applied_at: datetime
current_run_external_id: str
current_run_status: str
drifted: bool
external_id: str
module_count: int
modules: str
organization_name: str
project_external_id: str
project_name: str
provider_count: int
providers: str
resources_drifted: int
resources_undrifted: int
state_version_terraform_version: str
vcs_repo_identifier: str
workspace_created_at: datetime
workspace_name: str
workspace_terraform_version: str
workspace_updated_at: datetime
workspace_resource_count: int

EXAMPLE Q&A:
Q: What are my applied workspaces?
A: {
  "limit": null,
  "sort": null,
  "columns": [
    "external_id",
    "workspace_name",
    "current_run_status"
  ],
  "filters": [
    {
      "column": "current_run_status",
      "operator": "eq",
      "value": "applied"
    }
  ]
}

USER QUESTION: ${question}
ASSISTANT MACHINE-READABLE ANSWER IN JSON FORMAT: `;
  return prompt;
}

function ask(question, contextData) {
  const prompt = `A Q&A between a Terraform Cloud user and the LLM assistant that knows everything about the user's organization and workspaces. Stop after the first answer.
CONTEXT DATA FROM QUERY RESULTS:
${contextData}

USER QUESTION: ${question}
ASSISTANT ANSWER: `;
  return prompt;
}

async function completion(prompt, print = false, spinnerText = 'Loading...') {
  let spinner = ora(spinnerText).start();
  const { tokens } = await llama.createCompletion(
    {
      nThreads: 4,
      nTokPredict: 1024,
      topK: 40,
      topP: 0.1,
      temp: 0.2,
      repeatPenalty: 1,
      prompt,
    },
    (response) => {
      if (print) {
        spinner.isSpinning && spinner.stop();
        if (response.token === '<end>') return;
        if (response.token === '\n\n\n') return;
        if (response.token === 'EOT') return;
        process.stdout.write(`${response.token}`);
      }
    }
  );
  spinner.isSpinning && spinner.stop();
  // console.log('tokens:', tokens);
  tokens.pop();
  return tokens.join('').trim();
}

async function readAndFilterCSV(userCsvContent, args) {
  const parsed = Papa.parse(userCsvContent, { header: true });
  const rows = parsed.data;

  // Apply filters
  const filteredRows = args.filters.reduce((acc, filter) => {
    const { column, operator, value } = filter;
    return _.filter(acc, (row) => {
      if (operator === 'eq') return row[column] === value;
      if (operator === 'gt') return row[column] > value;
      if (operator === 'lt') return row[column] < value;
      if (operator === 'gte') return row[column] >= value;
      if (operator === 'lte') return row[column] <= value;
      if (operator === 'neq') return row[column] !== value;
      if (operator === 'contains') return row[column].includes(value);
      if (operator === 'not_contains') return !row[column].includes(value);
      if (operator === 'starts_with') return row[column].startsWith(value);
      if (operator === 'ends_with') return row[column].endsWith(value);
    });
  }, rows);

  // Select columns
  const selectedColumns = filteredRows.map((row) => _.pick(row, args.columns));

  return selectedColumns;
}

function extractAndParseJSON(str) {
  const jsonStart = str.indexOf('{');
  const jsonEnd = str.lastIndexOf('}') + 1;
  if (jsonStart === -1 || jsonEnd === -1) return null;

  const jsonStr = str.slice(jsonStart, jsonEnd);
  try {
    return JSON.parse(jsonStr);
  } catch (e) {
    return {};
  }
}

run(process.argv[2]);
