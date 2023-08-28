// index.mjs
import { LLM } from "llama-node";
import { LLamaCpp } from "llama-node/dist/llm/llama-cpp.js";
import path from "path";
import readline from 'readline';
import fs from 'fs';

const model = path.resolve(process.cwd(), "llama.cpp/models/llama-2-13b-chat.ggmlv3.q4_0.bin");

const llama = new LLM(LLamaCpp);
const config = {
    modelPath: model,
    enableLogging: false,
    nCtx: 1024,
    seed: 0,
    f16Kv: false,
    logitsAll: false,
    vocabOnly: false,
    useMlock: false,
    embedding: false,
    useMmap: true,
    nGpuLayers: 0
};

const chunkSize = 8; // Adjust this value as per the desired chunk size

const run = async () => {
  await llama.load(config);

  const fileStream = fs.createReadStream('user.csv');
  const rl = readline.createInterface({
    input: fileStream,
    crlfDelay: Infinity,
  });

  let chunk = [];
  let lineCount = 0;

  for await (const line of rl) {
    chunk.push(line);
    lineCount++;

    if (lineCount % chunkSize === 0 || line === 'EOF') { // EOF is an indicator for end of file
      const chunkData = chunk.join('\n');
      const prompt = `Summarize the following data chunk:\n${chunkData}`;

      await llama.createCompletion({
        nThreads: 4,
        nTokPredict: 2048,
        topK: 40,
        topP: 0.1,
        temp: 0.2,
        repeatPenalty: 1,
        prompt,
      }, (response) => {
        process.stdout.write(`Summary: ${response.token}\n`);
      });

      chunk = [];
    }
  }
};

run();
