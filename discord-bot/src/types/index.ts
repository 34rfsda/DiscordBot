export interface Command {
    name: string;
    description: string;
    execute: (args: string[]) => Promise<void>;
}

export interface BotResponse {
    content: string;
    ephemeral?: boolean;
}