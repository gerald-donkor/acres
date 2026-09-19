import type { MailMessage } from '../mail.interface';
import { MemoryMailAdapter } from './memory-mail.adapter';

describe('MemoryMailAdapter', () => {
  let adapter: MemoryMailAdapter;

  beforeEach(() => {
    adapter = new MemoryMailAdapter();
  });

  describe('initial state', () => {
    it('initializes with an empty sent list', () => {
      expect(adapter.sent).toEqual([]);
      expect(adapter.sent).toHaveLength(0);
    });
  });

  describe('send', () => {
    it('records a message and resolves successfully', async () => {
      const message: MailMessage = {
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Hello, World!',
      };

      await expect(adapter.send(message)).resolves.toBeUndefined();

      expect(adapter.sent).toHaveLength(1);
      expect(adapter.sent[0]).toEqual({
        to: 'recipient@example.com',
        subject: 'Test Subject',
        text: 'Hello, World!',
      });
    });

    it('records a message with optional html and from properties', async () => {
      const message: MailMessage = {
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'HTML Email',
        text: 'Plain text fallback',
        html: '<h1>HTML Heading</h1>',
      };

      await adapter.send(message);

      expect(adapter.sent).toHaveLength(1);
      expect(adapter.sent[0]).toEqual({
        from: 'sender@example.com',
        to: 'recipient@example.com',
        subject: 'HTML Email',
        text: 'Plain text fallback',
        html: '<h1>HTML Heading</h1>',
      });
    });

    it('clones the message payload so that external mutations do not affect recorded history', async () => {
      const message: MailMessage = {
        to: 'original@example.com',
        subject: 'Original Subject',
        text: 'Original Text',
      };

      await adapter.send(message);

      // Mutate the original object
      message.to = 'mutated@example.com';
      message.subject = 'Mutated Subject';
      message.text = 'Mutated Text';

      expect(adapter.sent[0].to).toBe('original@example.com');
      expect(adapter.sent[0].subject).toBe('Original Subject');
      expect(adapter.sent[0].text).toBe('Original Text');
    });

    it('records multiple messages in sequential FIFO order', async () => {
      await adapter.send({
        to: 'first@example.com',
        subject: 'First',
        text: '1',
      });
      await adapter.send({
        to: 'second@example.com',
        subject: 'Second',
        text: '2',
      });
      await adapter.send({
        to: 'third@example.com',
        subject: 'Third',
        text: '3',
      });

      expect(adapter.sent).toHaveLength(3);
      expect(adapter.sent.map((m) => m.to)).toEqual([
        'first@example.com',
        'second@example.com',
        'third@example.com',
      ]);
      expect(adapter.sent.map((m) => m.subject)).toEqual([
        'First',
        'Second',
        'Third',
      ]);
    });
  });

  describe('clear', () => {
    it('empties all recorded messages', async () => {
      await adapter.send({
        to: 'user1@example.com',
        subject: 'Subject 1',
        text: 'Body 1',
      });
      await adapter.send({
        to: 'user2@example.com',
        subject: 'Subject 2',
        text: 'Body 2',
      });

      expect(adapter.sent).toHaveLength(2);

      adapter.clear();

      expect(adapter.sent).toHaveLength(0);
      expect(adapter.sent).toEqual([]);
    });

    it('allows recording new messages after clearing', async () => {
      await adapter.send({
        to: 'pre@example.com',
        subject: 'Pre',
        text: 'Pre',
      });
      expect(adapter.sent).toHaveLength(1);

      adapter.clear();
      expect(adapter.sent).toHaveLength(0);

      await adapter.send({
        to: 'post@example.com',
        subject: 'Post',
        text: 'Post',
      });
      expect(adapter.sent).toHaveLength(1);
      expect(adapter.sent[0].to).toBe('post@example.com');
    });
  });
});
