class ChatMessage {
  const ChatMessage({
    required this.id,
    required this.conversationId,
    required this.senderId,
    required this.type,
    required this.text,
    required this.imageUrl,
    required this.imageName,
    required this.createdAt,
  });

  final String id;
  final String conversationId;
  final String senderId;
  final String type;
  final String text;
  final String imageUrl;
  final String imageName;
  final DateTime createdAt;

  factory ChatMessage.fromJson(Map<String, dynamic> json) {
    return ChatMessage(
      id: json['id'] as String,
      conversationId: json['conversationId'] as String,
      senderId: json['senderId'] as String,
      type: json['type'] as String,
      text: json['text'] as String? ?? '',
      imageUrl: json['imageUrl'] as String? ?? '',
      imageName: json['imageName'] as String? ?? '',
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
