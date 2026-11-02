import { nanoid } from "nanoid";
import type { Board, Turn, TurnKind } from "./types";

/** The board a first-time visitor sees, so the idea is obvious before they type anything. */

function answer(summary: string, body: string, ideas: string[] = []): string {
  const list = ideas.length ? `\n\n**Branch ideas**\n${ideas.map((q) => `- ${q}`).join("\n")}` : "";
  return `<summary>${summary}</summary>\n\n${body}${list}`;
}

const ROOT = answer(
  "Weights start random. Training repeats one loop: predict, measure the error, trace it back to each weight, and nudge them all.",
  `A neural network is a stack of layers. Each layer takes numbers in, multiplies them by **weights**, adds them up, and passes the result through a simple non-linear function. The weights start out random.

**Learning means nudging those weights** so the outputs get closer to the right answers. Training repeats one loop many thousands of times:

1. **Forward pass**: run an example through and get a prediction.
2. **Measure the error** with a loss function.
3. **Backpropagation**: work out how much each weight contributed to the error.
4. **Update**: move every weight a small step in the direction that reduces the error.

Nothing is programmed in by hand. Whatever the network ends up knowing comes from repeating this loop on data.`,
  ["What is a loss function?", "What does a single weight actually represent?", "Why do we need non-linear activation functions?"],
);

const LOSS = answer(
  'It turns "how wrong was that?" into one number for training to shrink. It is the only signal the network gets.',
  `A loss function turns "how wrong was that prediction?" into a single number. Training tries to make that number small.

- **Mean squared error** (for quantities): the average of (prediction − target)². Predicting 7 when the answer is 10 costs 9.
- **Cross-entropy** (for categories): punishes confident wrong answers hard. Saying 99% *cat* for a dog costs far more than saying 55% *cat*.

The loss is the only signal the network gets. If it measures the wrong thing, the network gets very good at the wrong thing.`,
  ["When would I pick cross-entropy over MSE?", "Can a loss function be custom?"],
);

const CROSS_ENTROPY = answer(
  "Cross-entropy for probabilities over classes, MSE for quantities. Cross-entropy corrects confident mistakes hardest.",
  `Use **cross-entropy when the output is a probability over classes** (spam or not, digits 0–9). Use **MSE when the output is a quantity** (a price, a temperature).

Cross-entropy gives a strong correction when the model is confidently wrong, so it learns fastest from its worst mistakes. MSE on probabilities flattens out near 0 and 1, so a confident, badly wrong model barely gets corrected.`,
);

const STEP = answer(
  "One neuron with w = 0.5: the loss is 4.0, the gradient is −8, and one update moves w to 0.9. The loss falls to 1.44.",
  `Take one neuron with weight **w = 0.5**, input **x = 2**, and target **y = 3**.

1. **Forward**: prediction = w · x = 1.0
2. **Loss** (squared error): (1.0 − 3)² = **4.0**
3. **Gradient**: d(loss)/dw = 2 · (prediction − y) · x = **−8**. This is the chain rule: the loss depends on the prediction, which depends on w.
4. **Update** with learning rate 0.05: w ← 0.5 − 0.05 · (−8) = **0.9**

New prediction: 0.9 · 2 = 1.8. The loss drops from 4.0 to 1.44. Repeat, and w settles at 1.5.`,
  ["What happens if the learning rate is too big?", "How does this scale to millions of weights?"],
);

const CHAIN = answer(
  "Think of gears: w turns the prediction, the prediction turns the loss. Multiply the two ratios: −4 × 2 = −8.",
  `Think of gears. Turning **w** turns the **prediction** gear, and the prediction turns the **loss** gear.

To know how much the loss moves when you nudge w, multiply the two gear ratios:

- how much the loss moves per unit of prediction: 2 · (1.0 − 3) = −4
- how much the prediction moves per unit of w: x = 2

−4 × 2 = −8. Backpropagation is this same multiplication carried backwards through every layer, one gear at a time.`,
);

const STOP = answer(
  "Watch the loss on data the network never trains on. When it turns upward, overfitting has started, so stop there.",
  `Hold back a **validation set** the network never trains on, and watch its loss.

- Early on, training loss and validation loss both fall. The network is learning real patterns.
- Eventually validation loss stops falling and starts rising while training loss keeps dropping. The network is now **memorising** the training data (overfitting).

Stop near that turning point. This is **early stopping**: keep the weights from the epoch with the lowest validation loss.`,
  ["What is dropout?", "How big should the validation set be?"],
);

export function makeSampleBoard(): Board {
  const now = Date.now();
  const turns: Record<string, Turn> = {};
  let order = 0;
  const add = (parentId: string | null, kind: TurnKind, question: string, text: string, quote?: string) => {
    const id = nanoid(10);
    turns[id] = { id, parentId, kind, question, quote, answer: text, status: "done", createdAt: now + order++ };
    return id;
  };

  const root = add(null, "root", "How does a neural network actually learn?", ROOT);
  const loss = add(root, "branch", "What is a loss function?", LOSS);
  add(loss, "followup", "When would I pick cross-entropy over MSE?", CROSS_ENTROPY);
  const step = add(root, "followup", "Walk me through one training step with real numbers", STEP);
  add(step, "branch", "Explain this more simply", CHAIN, "This is the chain rule: the loss depends on the prediction, which depends on w.");
  add(step, "followup", "How do I know when to stop training?", STOP);

  return {
    id: nanoid(10),
    title: "Example: How neural networks learn",
    rootIds: [root],
    turns,
    notes: [
      { id: nanoid(10), text: "Come back to these", color: "#f6e3b4", x: -356, y: 0, w: 150, h: 150 },
      { id: nanoid(10), text: "Why does deep beat wide?", color: "#f4d4d6", x: -190, y: 0, w: 150, h: 150 },
      { id: nanoid(10), text: "Build a tiny network by hand", color: "#d4e6ef", x: -356, y: 166, w: 150, h: 150 },
    ],
    mode: "threads",
    offsets: { threads: {}, mind: {} },
    sizes: {},
    collapsed: {},
    createdAt: now,
    updatedAt: now,
  };
}
