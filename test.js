import { interactWithModel } from './modelInteraction.mjs';

interactWithModel('Your input here', (err, response) => {
  if (err) console.error(`Error: ${err}`);
  else console.log(response);
});
