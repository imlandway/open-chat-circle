import 'package:open_chat_circle/models/app_user.dart';
import 'package:open_chat_circle/models/chat_message.dart';

class ConversationSummary {
  const ConversationSummary({
    required this.id,
    required this.type,
    required this.name,
    required this.memberIds,
    required this.members,
    required this.latestMessage,
    required this.unreadCount,
    required this.createdAt,
    required this.updatedAt,
  });

  final String id;
  final String type;
  final String name;
  final List<String> memberIds;
  final List<AppUser> members;
  final ChatMessage? latestMessage;
  final int unreadCount;
  final DateTime createdAt;
  final DateTime updatedAt;

  factory ConversationSummary.fromJson(Map<String, dynamic> json) {
    return ConversationSummary(
      id: json['id'] as String,
      type: json['type'] as String,
      name: json['name'] as String? ?? '',
      memberIds: (json['memberIds'] as List<dynamic>).cast<String>(),
      members: (json['members'] as List<dynamic>)
          .map((item) => AppUser.fromJson(item as Map<String, dynamic>))
          .toList(),
      latestMessage: json['latestMessage'] == null
          ? null
          : ChatMessage.fromJson(json['latestMessage'] as Map<String, dynamic>),
      unreadCount: json['unreadCount'] as int? ?? 0,
      createdAt: DateTime.parse(json['createdAt'] as String),
      updatedAt: DateTime.parse(json['updatedAt'] as String),
    );
  }
}
