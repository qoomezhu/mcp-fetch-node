import { streamFetch } from './src/utils/fetch-stream.js';

const controller = new AbortController();

const run = async () => {
  const { body } = await streamFetch('http://localhost:12345/timeout-test', 'agent', {
    timeout: 500,
  });

  try {
    for await (const chunk of body) {
      console.log('chunk', chunk);
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  } catch (error) {
    console.log('error', error);
  }
};

run();
