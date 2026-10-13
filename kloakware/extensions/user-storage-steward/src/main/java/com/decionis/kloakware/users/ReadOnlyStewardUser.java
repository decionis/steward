package com.decionis.kloakware.users;

import org.keycloak.models.UserModel;
import org.keycloak.models.utils.UserModelDelegate;
import org.keycloak.storage.ReadOnlyException;

/**
 * The imported copy of a Steward user, with the fields Steward owns made
 * read-only: the name and the email change in Steward, and the next sign-in
 * brings them over. Everything else (attributes, required actions, the
 * federated identities a broker links) stays kloakware's to change.
 */
final class ReadOnlyStewardUser extends UserModelDelegate {

  ReadOnlyStewardUser(UserModel delegate) {
    super(delegate);
  }

  @Override
  public void setUsername(String username) {
    throw readOnly("username");
  }

  @Override
  public void setEmail(String email) {
    throw readOnly("email");
  }

  @Override
  public void setFirstName(String firstName) {
    throw readOnly("first name");
  }

  @Override
  public void setLastName(String lastName) {
    throw readOnly("last name");
  }

  private static ReadOnlyException readOnly(String field) {
    return new ReadOnlyException("Steward owns this user's " + field + "; change it in Steward");
  }
}
