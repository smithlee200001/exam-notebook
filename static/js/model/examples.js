import { api } from "../api.js";
export async function loadExamples() {
  return api("/static/examples/questions.json");
}
