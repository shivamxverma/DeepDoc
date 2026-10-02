import { AzureOpenAI } from "openai";
import { config } from "./config";

export const azureClient = new AzureOpenAI({
  endpoint: config.AZURE_OPENAI_ENDPOINT,
  apiKey: config.AZURE_OPENAI_API_KEY,
  apiVersion: config.AZURE_OPENAI_API_VERSION,
});
