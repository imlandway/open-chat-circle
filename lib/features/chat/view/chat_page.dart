import 'package:file_picker/file_picker.dart';
import 'package:flutter/material.dart';
import 'package:provider/provider.dart';
import 'package:open_chat_circle/app/controllers/session_controller.dart';
import 'package:open_chat_circle/features/chat/controllers/chat_controller.dart';
import 'package:open_chat_circle/models/conversation_summary.dart';

class ChatPage extends StatefulWidget {
  const ChatPage({
    super.key,
    required this.conversation,
  });

  final ConversationSummary conversation;

  @override
  State<ChatPage> createState() => _ChatPageState();
}

class _ChatPageState extends State<ChatPage> {
  final _textController = TextEditingController();

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addPostFrameCallback((_) {
      context.read<ChatController>().loadMessages(widget.conversation.id);
    });
  }

  @override
  void dispose() {
    _textController.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    final controller = context.watch<ChatController>();
    final currentUserId = context.read<SessionController>().user!.id;
    final messages = controller.messagesFor(widget.conversation.id);

    return Scaffold(
      appBar: AppBar(title: Text(widget.conversation.name)),
      body: Column(
        children: [
          Expanded(
            child: ListView.builder(
              reverse: true,
              padding: const EdgeInsets.all(16),
              itemCount: messages.length,
              itemBuilder: (context, index) {
                final message = messages[messages.length - 1 - index];
                final mine = message.senderId == currentUserId;
                return Align(
                  alignment: mine ? Alignment.centerRight : Alignment.centerLeft,
                  child: Container(
                    margin: const EdgeInsets.only(bottom: 12),
                    padding: const EdgeInsets.all(12),
                    constraints: const BoxConstraints(maxWidth: 320),
                    decoration: BoxDecoration(
                      color: mine
                          ? Theme.of(context).colorScheme.primaryContainer
                          : Colors.white,
                      borderRadius: BorderRadius.circular(18),
                    ),
                    child: message.type == 'image'
                        ? Column(
                            crossAxisAlignment: CrossAxisAlignment.start,
                            children: [
                              ClipRRect(
                                borderRadius: BorderRadius.circular(12),
                                child: Image.network(
                                  message.imageUrl,
                                  fit: BoxFit.cover,
                                  errorBuilder: (_, __, ___) => const SizedBox(
                                    height: 120,
                                    child: Center(child: Text('图片加载失败')),
                                  ),
                                ),
                              ),
                              const SizedBox(height: 8),
                              Text(message.imageName),
                            ],
                          )
                        : Text(message.text),
                  ),
                );
              },
            ),
          ),
          SafeArea(
            top: false,
            child: Padding(
              padding: const EdgeInsets.fromLTRB(12, 0, 12, 12),
              child: Row(
                children: [
                  IconButton(
                    onPressed: () async {
                      final result = await FilePicker.platform.pickFiles(
                        type: FileType.image,
                        withData: true,
                      );
                      final file = result?.files.single;
                      if (file == null) {
                        return;
                      }
                      await controller.sendImage(
                        conversationId: widget.conversation.id,
                        file: file,
                      );
                    },
                    icon: const Icon(Icons.image_outlined),
                  ),
                  Expanded(
                    child: TextField(
                      controller: _textController,
                      decoration: const InputDecoration(
                        hintText: '输入消息',
                      ),
                    ),
                  ),
                  IconButton(
                    onPressed: () async {
                      final text = _textController.text.trim();
                      if (text.isEmpty) {
                        return;
                      }
                      _textController.clear();
                      await controller.sendText(
                        conversationId: widget.conversation.id,
                        text: text,
                      );
                    },
                    icon: const Icon(Icons.send_rounded),
                  ),
                ],
              ),
            ),
          ),
        ],
      ),
    );
  }
}
