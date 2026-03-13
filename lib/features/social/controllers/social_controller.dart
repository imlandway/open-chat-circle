import 'package:flutter/foundation.dart';
import 'package:open_chat_circle/features/social/data/social_api.dart';
import 'package:open_chat_circle/models/app_session.dart';
import 'package:open_chat_circle/models/app_user.dart';
import 'package:open_chat_circle/models/invite.dart';

class SocialController extends ChangeNotifier {
  SocialController({
    required SocialApi socialApi,
  }) : _socialApi = socialApi;

  final SocialApi _socialApi;

  AppSession? _session;
  List<AppUser> _contacts = const [];
  List<Invite> _invites = const [];
  bool _isLoading = false;

  List<AppUser> get contacts => _contacts;
  List<Invite> get invites => _invites;
  bool get isLoading => _isLoading;

  Future<void> bindSession(AppSession? session) async {
    _session = session;
    if (session == null) {
      _contacts = const [];
      _invites = const [];
      notifyListeners();
      return;
    }
    await refresh();
  }

  Future<void> refresh() async {
    if (_session == null) {
      return;
    }
    _isLoading = true;
    notifyListeners();
    try {
      _contacts = await _socialApi.listContacts(_session!.sessionToken);
      if (_session!.user.isAdmin) {
        _invites = await _socialApi.listInvites(_session!.sessionToken);
      }
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<AppUser> updateProfile({
    required String nickname,
    required String avatarUrl,
  }) async {
    final user = await _socialApi.updateProfile(
      _session!.sessionToken,
      nickname: nickname,
      avatarUrl: avatarUrl,
    );
    await refresh();
    return user;
  }

  Future<Invite> createInvite({
    required int uses,
    required DateTime expiresAt,
  }) async {
    final invite = await _socialApi.createInvite(
      _session!.sessionToken,
      uses: uses,
      expiresAt: expiresAt,
    );
    await refresh();
    return invite;
  }
}
