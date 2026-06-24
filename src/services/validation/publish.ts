export const PUBLISH_MESSAGE_MAX_LENGTH = 60000;

export function validatePublishMessage(message: string): void {
  if (!message.trim()) {
    throw new Error("Publish message cannot be empty.");
  }
  if (message.length > PUBLISH_MESSAGE_MAX_LENGTH) {
    throw new Error(`Publish message is too long. Max ${PUBLISH_MESSAGE_MAX_LENGTH} characters.`);
  }
}
