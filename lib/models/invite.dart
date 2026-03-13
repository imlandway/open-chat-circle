class Invite {
  const Invite({
    required this.id,
    required this.code,
    required this.createdBy,
    required this.maxUses,
    required this.usedCount,
    required this.expiresAt,
    required this.status,
    required this.createdAt,
  });

  final String id;
  final String code;
  final String createdBy;
  final int maxUses;
  final int usedCount;
  final DateTime expiresAt;
  final String status;
  final DateTime createdAt;

  factory Invite.fromJson(Map<String, dynamic> json) {
    return Invite(
      id: json['id'] as String,
      code: json['code'] as String,
      createdBy: json['createdBy'] as String,
      maxUses: json['maxUses'] as int,
      usedCount: json['usedCount'] as int,
      expiresAt: DateTime.parse(json['expiresAt'] as String),
      status: json['status'] as String,
      createdAt: DateTime.parse(json['createdAt'] as String),
    );
  }
}
