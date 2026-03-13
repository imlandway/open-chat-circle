import 'package:open_chat_circle/models/app_user.dart';
import 'package:open_chat_circle/models/invite.dart';
import 'package:open_chat_circle/shared/data/api_client.dart';

class SocialApi {
  const SocialApi(this._client);

  final ApiClient _client;

  Future<List<AppUser>> listContacts(String token) async {
    final response = await _client.get('/api/contacts', token: token);
    return (response['contacts'] as List<dynamic>)
        .map((item) => AppUser.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<AppUser> updateProfile(
    String token, {
    required String nickname,
    required String avatarUrl,
  }) async {
    final response = await _client.patch(
      '/api/users/me',
      token: token,
      body: {
        'nickname': nickname,
        'avatarUrl': avatarUrl,
      },
    );
    return AppUser.fromJson(response['user'] as Map<String, dynamic>);
  }

  Future<List<Invite>> listInvites(String token) async {
    final response = await _client.get('/api/invites', token: token);
    return (response['invites'] as List<dynamic>)
        .map((item) => Invite.fromJson(item as Map<String, dynamic>))
        .toList();
  }

  Future<Invite> createInvite(
    String token, {
    required int uses,
    required DateTime expiresAt,
  }) async {
    final response = await _client.post(
      '/api/invites',
      token: token,
      body: {
        'uses': uses,
        'expiresAt': expiresAt.toIso8601String(),
      },
    );
    return Invite.fromJson(response['invite'] as Map<String, dynamic>);
  }
}
