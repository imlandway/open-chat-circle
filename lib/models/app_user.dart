class AppUser {
  const AppUser({
    required this.id,
    required this.account,
    required this.nickname,
    required this.avatarUrl,
    required this.status,
    required this.createdAt,
    required this.isAdmin,
  });

  final String id;
  final String account;
  final String nickname;
  final String avatarUrl;
  final String status;
  final DateTime createdAt;
  final bool isAdmin;

  factory AppUser.fromJson(Map<String, dynamic> json) {
    return AppUser(
      id: json['id'] as String,
      account: json['account'] as String,
      nickname: json['nickname'] as String? ?? '',
      avatarUrl: json['avatarUrl'] as String? ?? '',
      status: json['status'] as String? ?? 'active',
      createdAt: DateTime.parse(json['createdAt'] as String),
      isAdmin: json['isAdmin'] as bool? ?? false,
    );
  }

  Map<String, dynamic> toJson() {
    return {
      'id': id,
      'account': account,
      'nickname': nickname,
      'avatarUrl': avatarUrl,
      'status': status,
      'createdAt': createdAt.toIso8601String(),
      'isAdmin': isAdmin,
    };
  }

  AppUser copyWith({
    String? nickname,
    String? avatarUrl,
    String? status,
  }) {
    return AppUser(
      id: id,
      account: account,
      nickname: nickname ?? this.nickname,
      avatarUrl: avatarUrl ?? this.avatarUrl,
      status: status ?? this.status,
      createdAt: createdAt,
      isAdmin: isAdmin,
    );
  }
}
