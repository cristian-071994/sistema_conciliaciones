from app.models.enums import UserRole


def sanitize_item_for_role(item_dict: dict, role: UserRole) -> dict:
    output = dict(item_dict)
    if role == UserRole.COINTRA:
        return output
    if role == UserRole.CLIENTE:
        output["tarifa_tercero"] = None
        output["rentabilidad"] = None
        return output
    output["tarifa_cliente"] = None
    output["rentabilidad"] = None
    return output
