import readline from 'readline';
import { spawn } from 'child_process';

const main = () => {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  const ollama = spawn('ollama', ['run', 'llama2-uncensored']);
  const initialInput = process.argv[2];

  if (initialInput) {
    ollama.stdin.write(`${initialInput}\n`);
  }

  ollama.stdout.on('data', (data) => {
    const output = data.toString();
    if (!output.includes('loading...')) { // Suppressing "ading..." part
      process.stdout.write(output.replace(/\u28../g, '')); // Write response without characters starting with \u28
    }
  });

  ollama.stderr.on('data', (data) => {
    const errorOutput = data.toString();
    if (!errorOutput.includes('loading...')) {
      console.error(errorOutput);
    }
  });

  rl.on('line', (input) => {
    if (input.toLowerCase() === 'exit') {
      ollama.kill();
      rl.close();
      return;
    }
    ollama.stdin.write(`${input}\n`);
  });
};

main();
