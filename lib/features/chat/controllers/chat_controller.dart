import 'dart:async';

import 'package:file_picker/file_picker.dart';
import 'package:flutter/foundation.dart';
import 'package:open_chat_circle/features/chat/data/chat_api.dart';
import 'package:open_chat_circle/models/app_session.dart';
import 'package:open_chat_circle/models/chat_message.dart';
import 'package:open_chat_circle/models/conversation_summary.dart';
import 'package:open_chat_circle/shared/data/realtime_client.dart';

class ChatController extends ChangeNotifier {
  ChatController({
    required ChatApi chatApi,
    required RealtimeClient realtimeClient,
  })  : _chatApi = chatApi,
        _realtimeClient = realtimeClient {
    _subscription = _realtimeClient.events.listen(_handleEvent);
  }

  final ChatApi _chatApi;
  final RealtimeClient _realtimeClient;
  StreamSubscription<Map<String, dynamic>>? _subscription;

  AppSession? _session;
  bool _isLoading = false;
  final Map<String, List<ChatMessage>> _messages = {};
  List<ConversationSummary> _conversations = const [];

  List<ConversationSummary> get conversations => _conversations;
  bool get isLoading => _isLoading;
  List<ChatMessage> messagesFor(String conversationId) => _messages[conversationId] ?? const [];

  Future<void> bindSession(AppSession? session) async {
    final previousToken = _session?.sessionToken;
    final nextToken = session?.sessionToken;
    _session = session;

    if (nextToken == null) {
      _realtimeClient.disconnect();
      _conversations = const [];
      _messages.clear();
      notifyListeners();
      return;
    }

    if (previousToken != nextToken) {
      _realtimeClient.connect(nextToken);
      await refreshConversations();
    }
  }

  Future<void> refreshConversations() async {
    if (_session == null) {
      return;
    }
    _isLoading = true;
    notifyListeners();
    try {
      _conversations = await _chatApi.listConversations(_session!.sessionToken);
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<void> loadMessages(String conversationId) async {
    if (_session == null) {
      return;
    }
    _messages[conversationId] = await _chatApi.listMessages(_session!.sessionToken, conversationId);
    final loadedMessages = _messages[conversationId]!;
    if (loadedMessages.isNotEmpty) {
      await _chatApi.markRead(
        _session!.sessionToken,
        conversationId: conversationId,
        messageId: loadedMessages.last.id,
      );
    }
    notifyListeners();
  }

  Future<ConversationSummary> ensureDirectConversation(String peerUserId) async {
    final conversation = await _chatApi.createDirectConversation(_session!.sessionToken, peerUserId);
    await refreshConversations();
    return conversation;
  }

  Future<ConversationSummary> createGroup({
    required String name,
    required List<String> memberIds,
  }) async {
    final conversation = await _chatApi.createGroupConversation(
      _session!.sessionToken,
      name: name,
      memberIds: memberIds,
    );
    await refreshConversations();
    return conversation;
  }

  Future<void> sendText({
    required String conversationId,
    required String text,
  }) async {
    await _chatApi.sendTextMessage(
      _session!.sessionToken,
      conversationId: conversationId,
      text: text,
    );
    await loadMessages(conversationId);
    await refreshConversations();
  }

  Future<void> sendImage({
    required String conversationId,
    required PlatformFile file,
  }) async {
    await _chatApi.sendImageMessage(
      _session!.sessionToken,
      conversationId: conversationId,
      file: file,
    );
    await loadMessages(conversationId);
    await refreshConversations();
  }

  void _handleEvent(Map<String, dynamic> event) {
    final type = event['type'];
    if (type == 'message.created' || type == 'read.updated') {
      unawaited(refreshConversations());
    }
  }

  @override
  void dispose() {
    _subscription?.cancel();
    _realtimeClient.dispose();
    super.dispose();
  }
}
