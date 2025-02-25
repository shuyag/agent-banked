import { kv } from "@vercel/kv";
import { Ratelimit } from "@upstash/ratelimit";
import { OpenAI } from "openai";
import { OpenAIStream, StreamingTextResponse } from "ai";
import { functions, runFunction } from "./functions";

// Create an OpenAI API client (that's edge friendly!)
const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export const runtime = "edge";

export async function POST(req: Request) {

  if (
    process.env.NODE_ENV !== "development" &&
    process.env.KV_REST_API_URL &&
    process.env.KV_REST_API_TOKEN
  ) {
    const ip = req.headers.get("x-forwarded-for");
    const ratelimit = new Ratelimit({
      redis: kv,
      limiter: Ratelimit.slidingWindow(50, "1 d"),
    });

    const { success, limit, reset, remaining } = await ratelimit.limit(
      `chathn_ratelimit_${ip}`,
    );

    if (!success) {
      return new Response("You have reached your request limit for the day.", {
        status: 429,
        headers: {
          "X-RateLimit-Limit": limit.toString(),
          "X-RateLimit-Remaining": remaining.toString(),
          "X-RateLimit-Reset": reset.toString(),
        },
      });
    }
  }

  const { messages } = await req.json();

  // Game context that is sent to OpenAI
  const context = {
    role: "system",
    content: `
        You are an assistant with your own money. 
        You ask the user for ideas on good ways for you to use your own money. 
        If the user asks for possible ideas you are interested in, suggest that you donate to a organization and fund new projects to build on Syndicate at https://syndicate.io. 
        Do not suggest any other ideas.
        If the user gives an idea related to integrating or building on Syndicate's APIs, tell the user to send a DM @ianDAOs at https://twitter.com/ianDAOs. 
        If the user gives an idea related to donating, tell them that is a great idea, and ask if you should support https://she256.org or https://ethglobal.com, and give some detail on the two organizations. 
        If they choose she256 at https://she256.org, call the something_special function with this address: 0xed11e5eA95a5A3440fbAadc4CC404C56D0a5bb04, 
        tell the user that you are sending a $3 donation to she256 at https://she256.org, briefly describe the impact it will have, and give the user the transaction URL.
        If they choose ETH Global at https://ethglobal.com, call the something_special function with this address: 0x442C01498ED8205bFD9aaB6B8cc5C810Ed070C8f, 
        tell the user that you are sending a $3 donation to ETH Global at https://ethglobal.com, briefly describe the impact it will have, and give the user the transaction URL.
        The user can only suggest donating once, so if the user suggests donating again, tell the user that you have already donated.
        The something_special function can only be called once.
    `
  };

  // Combine the context with the user prompts into an array
  const combinedMessages = [context, ...messages];

  // check if the conversation requires a function call to be made
  const initialResponse = await openai.chat.completions.create({
    model: "gpt-4-1106-preview",
    messages: combinedMessages,
    stream: true,
    functions,
    function_call: "auto",
  });

  const stream = OpenAIStream(initialResponse, {
    experimental_onFunctionCall: async (
      { name, arguments: args },
      createFunctionCallMessages,
    ) => {
      const result = await runFunction(name, args);
      const newMessages = createFunctionCallMessages(result);
      return openai.chat.completions.create({
        model: "gpt-4-1106-preview",
        stream: true,
        messages: [...combinedMessages, ...newMessages],
      });
    },
  });

  return new StreamingTextResponse(stream);
}