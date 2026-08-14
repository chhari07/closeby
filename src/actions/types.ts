export interface ActionResult<T = undefined> {
  ok: boolean;
  error?: string;
  data?: T;
}
