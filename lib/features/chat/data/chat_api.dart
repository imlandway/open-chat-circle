import 'package:file_picker/file_picker.dart';
import 'package:open_chat_circle/models/chat_message.dart';
import 'package:open_chat_circle/models/conversation_summary.dart';
import 'package:open_chat_circle/models/upload_result.dart';
import 'package:open_chat_circle/shared/data/api_client.dart';

class ChatApi {
  const ChatApi(this._client);

  final ApiClient _client;

  Future<List<ConversationSummary>> listConversations(String token) async {
    final response = await _client.get('/api/conversations', token: token);
    return (response['conversations'] as List<dynamic>)
        .map((item) => ConversationSummary.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<ConversationSummary> createDirectConversation(String token, String peerUserId) async {
    final response = await _client.post(
      '/api/conversations/direct',
      token: token,
      body: {'peerUserId': peerUserId},
    );
    return ConversationSummary.fromJson(response['conversation'] as Map<String, dynamic>);
  }

  Future<ConversationSummary> createGroupConversation(
    String token, {
    required String name,
    required List<String> memberIds,
  }) async {
    final response = await _client.post(
      '/api/conversations/group',
      token: token,
      body: {
        'name': name,
        'memberIds': memberIds,
      },
    );
    return ConversationSummary.fromJson(response['conversation'] as Map<String, dynamic>);
  }

  Future<List<ChatMessage>> listMessages(String token, String conversationId) async {
    final response = await _client.get(
      '/api/conversations/$conversationId/messages',
      token: token,
    );
    return (response['messages'] as List<dynamic>)
        .map((item) => ChatMessage.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<ChatMessage> sendTextMessage(
    String token, {
    required String conversationId,
    required String text,
  }) async {
    final response = await _client.post(
      '/api/conversations/$conversationId/messages',
      token: token,
      body: {
        'type': 'text',
        'text': text,
      },
    );
    return ChatMessage.fromJson(response['message'] as Map<String, dynamic>);
  }

  Future<ChatMessage> sendImageMessage(
    String token, {
    required String conversationId,
    required PlatformFile file,
  }) async {
    final upload = UploadResult.fromJson(
      await _client.uploadImage(token: token, file: file),
    );
    final response = await _client.post(
      '/api/conversations/$conversationId/messages',
      token: token,
      body: {
        'type': 'image',
        'imageUrl': upload.url,
        'imageName': upload.name,
      },
    );
    return ChatMessage.fromJson(response['message'] as Map<String, dynamic>);
  }

  Future<void> markRead(
    String token, {
    required String conversationId,
    required String messageId,
  }) async {
    await _client.post(
      '/api/conversations/$conversationId/read',
      token: token,
      body: {
        'messageId': messageId,
      },
    );
  }
}
