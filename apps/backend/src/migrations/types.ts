export interface Migration {
  id: string;
  description: string;
  up: string[];
}
